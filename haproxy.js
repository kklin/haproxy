var image = "haproxy:1.6.4";
var configPath = "/usr/local/etc/haproxy/haproxy.cfg";

function Haproxy(n, services, port) {
    services = Array.isArray(services) ? services : [services];
    port = port || 80;

    var hostnames = _.flatten(services.map(function(service) {
      return service.children();
    }));
    var addresses = hostnames.map(function(host) {
      return host + ":" + port;
    });

    var files = {};
    files[configPath] = buildConfig(addresses);
    var hapRef = new Container(image,
        ["haproxy-systemd-wrapper", "-p", "/run/haproxy.pid", "-f", configPath]
    ).withFiles(files);

    this.service = new Service("hap", hapRef.replicate(n));
    services.forEach(function(service) {
      this.service.connect(port, service);
    }.bind(this));

    this.public = function() {
      publicInternet.connect(80, this.service);
    };

    this.deploy = function(deployment) {
        deployment.deploy(this.service);
    };
};

function buildConfig(addrs) {
    var config = read("./haproxy.cfg");
    for (var i = 0 ; i < addrs.length; i++) {
        config += "\n    server " + i + " " + addrs[i] + " check resolvers dns";
    }
    return config;
}

module.exports.Haproxy = Haproxy;
