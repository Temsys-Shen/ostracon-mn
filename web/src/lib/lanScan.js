/**
 * LAN scanner using fetch() — netmap.js style host discovery.
 * Probes candidate IPs on the OB port and reports discovered services.
 */

const CONCURRENCY = 50;
const TIMEOUT_MS = 800;

/**
 * Try to discover the local IP via WebRTC (may not work in all webviews).
 */
function getLocalIP() {
  return new Promise((resolve) => {
    try {
      var RTCPeerConnection =
        window.RTCPeerConnection ||
        window.webkitRTCPeerConnection ||
        window.mozRTCPeerConnection;
      if (!RTCPeerConnection) {
        resolve(null);
        return;
      }
      var pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel("");
      pc.createOffer()
        .then(function (offer) {
          return pc.setLocalDescription(offer);
        })
        .catch(function () {
          resolve(null);
        });
      pc.onicecandidate = function (ice) {
        if (!ice || !ice.candidate || !ice.candidate.candidate) return;
        var parts = ice.candidate.candidate.split(" ");
        var ip = parts[4];
        if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
          pc.close();
          resolve(ip);
        }
      };
      setTimeout(function () {
        pc.close();
        resolve(null);
      }, 2000);
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Build candidate host list from a subnet.
 */
function buildHosts(subnet) {
  var hosts = [];
  for (var i = 1; i <= 254; i++) {
    hosts.push(subnet + "." + i);
  }
  return hosts;
}

/**
 * Get candidate subnets based on local IP or fallback to common ones.
 */
function getCandidateSubnets(localIP, lastHost) {
  var subnets = [];

  // From local IP
  if (localIP) {
    var parts = localIP.split(".");
    subnets.push(parts[0] + "." + parts[1] + "." + parts[2]);
  }

  // From last connected host
  if (lastHost && /^\d+\.\d+\.\d+\.\d+$/.test(lastHost) && lastHost !== "127.0.0.1") {
    var lp = lastHost.split(".");
    var sn = lp[0] + "." + lp[1] + "." + lp[2];
    if (subnets.indexOf(sn) === -1) {
      subnets.push(sn);
    }
  }

  // Fallback: common subnets
  var fallbacks = ["192.168.1", "192.168.0", "10.0.0", "172.16.0"];
  fallbacks.forEach(function (sn) {
    if (subnets.indexOf(sn) === -1) {
      subnets.push(sn);
    }
  });

  return subnets;
}

/**
 * Probe a single host:port for the OB discovery endpoint.
 */
async function probeHost(host, port) {
  var controller = new AbortController();
  var timer = setTimeout(function () {
    controller.abort();
  }, TIMEOUT_MS);
  try {
    var resp = await fetch("http://" + host + ":" + port + "/ostracon/discover", {
      signal: controller.signal,
      mode: "cors",
    });
    if (resp.ok) {
      var json = await resp.json();
      if (json && json.name) {
        return { name: json.name, host: host, port: json.port || port };
      }
    }
  } catch (_) {
    // host unreachable or CORS error — skip
  } finally {
    clearTimeout(timer);
  }
  return null;
}

/**
 * Scan the LAN for Ostracon OB instances.
 * @param {number} port - OB port
 * @param {Function} onFound - callback({ name, host, port })
 * @param {string} lastHost - last connected host from settings
 * @returns {Function} stop function
 */
export async function scanLan(port, onFound, lastHost) {
  var stopped = false;

  // Always try localhost first (fast)
  var localhosts = ["127.0.0.1", "[::1]"];
  for (var i = 0; i < localhosts.length; i++) {
    if (stopped) return;
    var result = await probeHost(localhosts[i], port);
    if (result && onFound) onFound(result);
  }

  if (stopped) return;

  // Also try the last connected host
  if (lastHost && lastHost !== "127.0.0.1" && lastHost !== "::1" && lastHost !== "::") {
    var clean = lastHost;
    if (clean.startsWith("[") && clean.endsWith("]")) {
      clean = clean.slice(1, -1);
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(clean)) {
      var lr = await probeHost(clean, port);
      if (lr && onFound) onFound(lr);
    }
  }

  if (stopped) return;

  // Get local IP to determine subnet
  var localIP = await getLocalIP();
  var subnets = getCandidateSubnets(localIP, lastHost);

  // Scan subnets with concurrency
  for (var s = 0; s < subnets.length && !stopped; s++) {
    var hosts = buildHosts(subnets[s]);
    for (var j = 0; j < hosts.length && !stopped; j += CONCURRENCY) {
      var batch = hosts.slice(j, j + CONCURRENCY);
      var results = await Promise.all(
        batch.map(function (host) {
          return probeHost(host, port);
        }),
      );
      for (var k = 0; k < results.length && !stopped; k++) {
        if (results[k] && onFound) {
          onFound(results[k]);
        }
      }
    }
  }

  return function stop() {
    stopped = true;
  };
}