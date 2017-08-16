const { Container, Service } = require('@quilt/quilt');
const fs = require('fs');
const path = require('path');
const Mustache = require('mustache');

const image = 'haproxy:1.7';
const configPath = '/usr/local/etc/haproxy/haproxy.cfg';

// The port HAProxy uses to communicate with the services behind it.
const internalPort = 80;

// The port HAProxy listens on.
const exposedPort = 80;

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
  config += `
${frontendConfig}

${backendConfig}
`;

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

  const hapRef = new Container(image, ['-f', configPath]).withFiles(files);

  const haproxy = new Service('haproxy', hapRef.replicate(n));
  services.forEach((service) => {
    service.allowFrom(haproxy, internalPort);
  });

  return haproxy;
}


/**
 * Returns rules for choosing a backend based on the Host header in an incoming
 * HTTP request.
 * @param {string} domain - The domain name for which the given backend should handle
 * traffic.
 * @param {string} backendName - The backend that should receive traffic for the domain.
 * This is a HAProxy identifier for within the config file. It should be match
 * a backend created with `createBackendConfig`.
 * @return {string}
 */
function urlRoutingConfig(domain, backendName) {
  return `    acl ${backendName}_req hdr(host) -i ${domain}
    use_backend ${backendName} if ${backendName}_req`;
}


/**
 * Returns backend rules to load balance over the given service, using sticky
 * sessions.
 * @param {string} name - An identifier for the created backend config. Other
 * parts of the config that reference this backend should do so using this
 * name.
 * @param {Service} service - The service for which to generate
 * backend rules.
 * @param {string} balance - The load balancing algorithm to use. See HAProxy's
 * docs for possible algorithms.
 * @return {string}
 */
function createBackendConfig(name, service, balance) {
  // The SERVERID session cookie ensures that a given user's requests are always
  // forwarded to the same backend server.
  let config = `backend ${name}
    balance ${balance}
    cookie SERVERID insert indirect nocache`;

  service.children().forEach((addr, i) => {
    const serverName = `${name}-${i}`;
    config += `
    server ${serverName} ${addr}:${internalPort} check resolvers dns cookie ${serverName}`;
  });

  return config;
}


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
  const frontendConfig = '    default_backend default';
  const backendConfig = createBackendConfig('default', service, balance);
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
  const domains = Object.keys(domainToService);
  const frontendConfig = domains.map(
    domain => urlRoutingConfig(domain, domain))
    .join('\n\n');
  const backendConfig = domains.map(
    domain => createBackendConfig(domain, domainToService[domain], balance))
    .join('\n\n');
  const files = createConfigFiles(frontendConfig, backendConfig);

  return createHapService(n, Object.values(domainToService), files);
}


module.exports = { exposedPort, singleServiceLoadBalancer, withURLrouting };
