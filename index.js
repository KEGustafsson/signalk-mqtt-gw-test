/*
 * Copyright 2016 Teppo Kurki <teppo.kurki@iki.fi>
 * Copyright 2024 Karl-Erik Gustafsson
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

const id = 'signalk-mqtt-gw-test';
const debug = require('debug')(id);

module.exports = function createPlugin(app) {
  const plugin = {};
  plugin.id = id;
  plugin.name = 'SignalK AisStream';
  plugin.description = 'Track the worlds vessels (AIS) via websocket. Easy to configure and use.';

  var server; 
  var aedes;
  var unsubscribes = [];
  const setStatus = app.setPluginStatus || app.setProviderStatus;
  
  plugin.start = function (options) {
    app.debug("Aedes MQTT Plugin Started");
    plugin.onStop = [];

    if (options.runLocalServer) {
      startLocalServer(options, plugin.onStop);
    }
    started = true;
  };

  plugin.stop = function stop() {
    unsubscribes.forEach((f) => f());
    unsubscribes = [];
    if (server) {
      server.close();
      aedes.close();
    }
    socket = null;
    app.debug("Aedes MQTT Plugin Stopped");
  };
  
  plugin.schema = {
    title: 'Signal K - MQTT Gateway',
    type: 'object',
    required: ['port'],
    properties: {
      runLocalServer: {
        type: 'boolean',
        title: 'Run local server (publish all deltas there in individual topics based on SK path and convert all data published in them by other clients to SK deltas)',
        default: false,
      },
      port: {
        type: 'number',
        title: 'Local server port',
        default: 1883,
      },
    },
  };

  function startLocalServer(options, onStop) {
    aedes = require('aedes')();
    server = require('net').createServer(aedes.handle)
    const port = options.port || 1883;

    server.listen(port, function() {
      console.log('server listening on port', port)
      aedes.publish({ topic: 'aedes/hello', payload: "I'm broker " + aedes.id })
    })

    app.signalk.on('delta', publishLocalDelta);
    onStop.push(_ => { app.signalk.removeListener('delta', publishLocalDelta) });

    server.on('clientConnected', function(client) {
      console.log('client connected', client.id);
    });

    server.on('ready', onReady);
    // server.on('error', (err) => {
    //   app.error(err)
    // })

    function onReady() {
      try {
        const mdns = require('mdns');
        ad = mdns.createAdvertisement(mdns.tcp('mqtt'), options.port);
        ad.start();
      } catch (e) {
        console.error(e.message);
      }
      console.log(
        'Aedes MQTT server is up and running on port ' + options.port
      );
      onStop.push(_ => { 
        server.close()
        aedes.close()
      });
    }
  }

  function publishLocalDelta(delta) {
    const prefix =
      (delta.context === app.selfContext
        ? 'vessels/self'
        : delta.context.replace('.', '/')) + '/';
    (delta.updates || []).forEach(update => {
      (update.values || []).forEach(pathValue => {
        aedes.publish({
          topic: prefix + pathValue.path.replace(/\./g, '/'),
          payload:
            pathValue.value === null ? 'null' : toText(pathValue.value),
          qos: 0,
          retain: false,
        });
      });
    });
  }

  function toText(value) {
    if (typeof value === 'object') {
      return JSON.stringify(value)
    }
    return value.toString()
  }

  return plugin;
};