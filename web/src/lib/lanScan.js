/**
 * LAN scanner using fetch() — netmap.js style host discovery.
 * Probes candidate IPs on the OB port and reports discovered services.
 */

const CONCURRENCY = 50;
const TIMEOUT_MS = 800;

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

function buildFallbackSubnets() {
  var subnets = ["192.168.1", "192.168.100"];
  for (var i = 0; i <= 99; i++) {
    if (i !== 1) {
      subnets.push("192.168." + i);
    }
  }
  subnets.push("10.0.0", "172.16.0");
  return subnets;
}

/**
 * Get candidate subnets based on the last connected host and known LAN ranges.
 */
function getCandidateSubnets(lastHost) {
  var subnets = [];

  // From last connected host
  if (lastHost && /^\d+\.\d+\.\d+\.\d+$/.test(lastHost) && lastHost !== "127.0.0.1") {
    var lp = lastHost.split(".");
    var sn = lp[0] + "." + lp[1] + "." + lp[2];
    if (subnets.indexOf(sn) === -1) {
      subnets.push(sn);
    }
  }

  // Fallback: common subnets
  var fallbacks = buildFallbackSubnets();
  fallbacks.forEach(function (sn) {
    if (subnets.indexOf(sn) === -1) {
      subnets.push(sn);
    }
  });

  return subnets;
}

export const __test__ = {
  buildFallbackSubnets,
  getCandidateSubnets,
};

/**
 * Probe a single host:port for the OB discovery endpoint.
 */
async function probeHost(host, port, controllers) {
  var controller = new AbortController();
  controllers.add(controller);
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
    controllers.delete(controller);
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
export function scanLan(port, onFound, lastHost) {
  var stopped = false;
  var controllers = new Set();

  async function run() {
    // Always try localhost first (fast)
    var localhosts = ["127.0.0.1", "[::1]"];
    for (var i = 0; i < localhosts.length; i++) {
      if (stopped) return;
      var result = await probeHost(localhosts[i], port, controllers);
      if (result && !stopped && onFound) onFound(result);
    }

    if (stopped) return;

    // Also try the last connected host
    if (lastHost && lastHost !== "127.0.0.1" && lastHost !== "::1" && lastHost !== "::") {
      var clean = lastHost;
      if (clean.startsWith("[") && clean.endsWith("]")) {
        clean = clean.slice(1, -1);
      }
      if (/^\d+\.\d+\.\d+\.\d+$/.test(clean)) {
        var lr = await probeHost(clean, port, controllers);
        if (lr && !stopped && onFound) onFound(lr);
      }
    }

    if (stopped) return;

    var subnets = getCandidateSubnets(lastHost);

    // Scan subnets with concurrency
    for (var s = 0; s < subnets.length && !stopped; s++) {
      var hosts = buildHosts(subnets[s]);
      for (var j = 0; j < hosts.length && !stopped; j += CONCURRENCY) {
        var batch = hosts.slice(j, j + CONCURRENCY);
        var results = await Promise.all(
          batch.map(function (host) {
            return probeHost(host, port, controllers);
          }),
        );
        for (var k = 0; k < results.length && !stopped; k++) {
          if (results[k] && onFound) {
            onFound(results[k]);
          }
        }
      }
    }
  }

  run().catch(function (error) {
    if (!stopped) {
      console.log("[Ostracon] discovery scan failed:", error);
    }
  });

  return function stop() {
    stopped = true;
    controllers.forEach(function (controller) {
      controller.abort();
    });
    controllers.clear();
  };
}
