const { Container, Service } = require('@quilt/quilt');
const fs = require('fs');
const path = require('path');
const util = require('util');
const Mustache = require('mustache');

const image = 'haproxy:1.7';
const configPath = '/usr/local/etc/haproxy/haproxy.cfg';

// The port HAProxy uses to communicate with the services behind it.
const internalPort = 80;

// The port HAProxy listens on.
const exposedPort = 80;

// The SERVERID session cookie ensures that a given user's requests are always
// forwarded to the same backend server.
const backendPattern = `
backend %s
    balance %s
    cookie SERVERID insert indirect nocache`;


/**
 * Creates a replicated HAProxy service that load balances over instances of a
 * single service, using sticky sessions.
 * @param {number} n - The desired number of HAProxy replicas.
 * @param {Service} service - The service whose traffic should be load balanced.
 * @param {string} balance - The load balancing algorithm to use.
 * @return {Service} - The HAProxy service.
 */
function singleServiceLoadBalancer(n, service, balance = 'roundrobin') {
  // This is a temporary hack to make the MEAN example in the README simpler.
  const defaultBackendPattern = `
    default_backend %s`;
  const frontendConfig = util.format(defaultBackendPattern, backendName(service));
  const backendConfig = createBackendConfigs(service, balance);
  const files = createConfigFiles(frontendConfig, backendConfig);

  return createHapService(n, service, files);
}


/**
 * Creates a replicated HAProxy service that does load balanced, URL based
 * routing with sticky sessions.
 * @param {number} n - The desired number of HAProxy replicas.
 * @param {Object.<string, Service>} domainToService - A map from domain name to
 * the service that should receive traffic for that domain.
 * @param {string} balance - The load balancing algorithm to use.
 * @return {Service} - The HAProxy service.
 */
function withURLrouting(n, domainToService, balance = 'roundrobin') {
  const services = Object.values(domainToService);
  const frontendConfig = urlRoutingConfig(domainToService);
  const backendConfig = createBackendConfigs(services, balance);
  const files = createConfigFiles(frontendConfig, backendConfig);

  return createHapService(n, services, files);
}


/**
 * Returns a map from the HAProxy config path to the combined frontend and
 * backend configs.
 * @param {string} frontendConfig
 * @param {string} backendConfig
 * @return {Object.<string, string>}
 */
function createConfigFiles(frontendConfig, backendConfig) {
  const configTempl = fs.readFileSync(
    path.join(__dirname, 'haproxy.cfg'), { encoding: 'utf8' });

  let config = Mustache.render(configTempl, { port: exposedPort });
  config += `${frontendConfig}
${backendConfig}`;

  const files = {};
  files[configPath] = config;

  return files;
}


/**
 * Returns an HAProxy service with n containers containing the given files.
 * @param {number} n - The number of HAProxy replicas in the service.
 * @param {(Service|Service[])} services - The services to put behind the proxy.
 * @param {Object.<string, string>} files - A map from filenames to file
 * contents, describing the files to put in each of the proxy containers.
 * @return {Service} - The new HAProxy service.
 */
function createHapService(n, servicesArg, files) {
  const services = Array.isArray(servicesArg) ? servicesArg : [servicesArg];

  const hapRef = new Container(image, [
    'haproxy-systemd-wrapper', '-p', '/run/haproxy.pid', '-f', configPath,
  ]).withFiles(files);

  const haproxy = new Service('haproxy', hapRef.replicate(n));
  services.forEach((service) => {
    service.allowFrom(haproxy, internalPort);
  });

  return haproxy;
}


/**
 * Returns rules for choosing a backend based on the Host header in an incoming
 * HTTP request.
 * @param {Object.<string, Service>} domainToService - A map from domain name to
 * the service that should receive traffic for that domain.
 * @return {string}
 */
function urlRoutingConfig(domainToService) {
  const aclPattern = `
    acl %s hdr(host) -i %s`;
  const useBackendPattern = `
    use_backend %s if %s`;

  let acls = '';
  let backendRules = '';

  Object.keys(domainToService).forEach((domain) => {
    const name = backendName(domainToService[domain]);
    const match = `${name}_req`;

    acls += util.format(aclPattern, match, domain);
    backendRules += util.format(useBackendPattern, name, match);
  });

  return acls + backendRules;
}


/**
 * Returns backend rules to load balance over the given services, using sticky
 * sessions.
 * @param {(Service|Service[])} services - The services for which to generate
 * backend rules. See HAProxy's docs for possible balance algorithms.
 * @param {string} balance - The load balancing algorithm to use. See HAProxy's
 * docs for possible algorithms.
 * @return {string}
 */
function createBackendConfigs(servicesArg, balance) {
  const services = Array.isArray(servicesArg) ? servicesArg : [servicesArg];
  let config = '';

  services.forEach((service) => {
    const name = backendName(service);
    const addrs = service.children();
    const serverPattern = `
    server %s %s:%d check resolvers dns cookie %s`;

    config += util.format(backendPattern, name, balance);
    addrs.forEach((addr, i) => {
      const serverName = util.format('%s-%d', name, i);
      config += util.format(serverPattern,
        serverName, addrs[i], internalPort, serverName);
    });

    config += '\n';
  });

  return config;
}


/**
 * Returns the backend name for the given Service.
 * @param {Service} service
 * @return {string}
 */
function backendName(service) {
  return service.name;
}

module.exports = { exposedPort, singleServiceLoadBalancer, withURLrouting };
