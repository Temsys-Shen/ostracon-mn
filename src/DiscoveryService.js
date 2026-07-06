var __MN_DISCOVERY_SERVICE_MNOstraconAddon = (function () {
  var activeDiscovery = null;
  var currentCallback = null;

  function makeUrl(host, port) {
    var hostPart = host;
    if (host.includes(":") && !host.startsWith("[")) {
      hostPart = "[" + host + "]";
    }
    return "http://" + hostPart + ":" + port + "/ostracon/discover";
  }

  function tryDiscover(host, port, onComplete) {
    var url = makeUrl(host, port);
    var request = NSMutableURLRequest.requestWithURL(NSURL.URLWithString(url));
    request.setHTTPMethod("GET");
    request.setTimeoutInterval(3);

    NSURLConnection.sendAsynchronousRequestQueueCompletionHandler(
      request,
      NSOperationQueue.mainQueue(),
      function (response, data, error) {
        if (error) {
          onComplete(null);
          return;
        }
        try {
          var statusCode = response.statusCode();
          if (statusCode !== 200 || !data) {
            onComplete(null);
            return;
          }
          var json = NSJSONSerialization.JSONObjectWithDataOptions(data, 0);
          if (json && json.name) {
            onComplete({
              name: String(json.name),
              host: host,
              port: json.port ? Number(json.port) : port,
            });
          } else {
            onComplete(null);
          }
        } catch (e) {
          console.log("[Ostracon] discovery parse error: " + e);
          onComplete(null);
        }
      },
    );
  }

  function startDiscovery(callback, port) {
    try {
      stopDiscovery();

      currentCallback = callback || null;
      var scanPort = port || 27123;

      // Candidate hosts: localhost (both stacks), plus last-known host from settings
      var candidates = ["127.0.0.1", "[::1]"];

      // Try to include the last connected host as a candidate
      try {
        var settings = __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.getWsSettings();
        if (settings && settings.host && settings.host !== "127.0.0.1" && settings.host !== "::" && settings.host !== "::1") {
          candidates.push(settings.host);
        }
      } catch (e) {
        // settings not available
      }

      var pending = candidates.length;
      var found = false;
      var stopped = false;

      activeDiscovery = {
        stop: function () {
          stopped = true;
          activeDiscovery = null;
          currentCallback = null;
        },
      };

      candidates.forEach(function (host) {
        tryDiscover(host, scanPort, function (result) {
          if (stopped) return;
          pending--;
          if (result && !found) {
            found = true;
            if (currentCallback) {
              currentCallback({
                type: "found",
                service: result,
              });
            }
          }
          if (pending === 0) {
            activeDiscovery = null;
          }
        });
      });

      return activeDiscovery;
    } catch (e) {
      console.log("[Ostracon] DiscoveryService init failed: " + e);
      currentCallback = null;
      if (callback) {
        callback({ type: "error", message: String(e) });
      }
      return null;
    }
  }

  function stopDiscovery() {
    if (activeDiscovery) {
      activeDiscovery.stop();
    }
  }

  return {
    startDiscovery: startDiscovery,
    stopDiscovery: stopDiscovery,
  };
})();