/* eslint-env mocha */

const assert = require('chai').assert;
const kelda = require('kelda');
const haproxy = require('../haproxy');

describe('haproxy', () => {
  beforeEach(() => {
    kelda.resetGlobals();
  });

  describe('simpleLoadBalancer', () => {
    it('config', () => {
      const expConfig = `global

defaults
    log     global
    mode    http
    timeout connect 5000
    timeout client 5000
    timeout server 5000

resolvers dns
    nameserver gateway 10.0.0.1:53

frontend http-in
    bind *:80

    default_backend default

backend default
    balance roundrobin
    cookie SERVERID insert indirect nocache
    server foo foo:80 check resolvers dns cookie foo
    server foo2 foo2:80 check resolvers dns cookie foo2
`;

      const containers = [];
      for (let i = 0; i < 2; i += 1) {
        containers.push(new kelda.Container('foo', 'image'));
      }
      const hap = haproxy.simpleLoadBalancer(containers);
      assert.equal(hap.filepathToContent['/usr/local/etc/haproxy/haproxy.cfg'],
        expConfig);
    });
  });

  describe('withURLrouting', () => {
    it('config', () => {
      const expConfig = `global

defaults
    log     global
    mode    http
    timeout connect 5000
    timeout client 5000
    timeout server 5000

resolvers dns
    nameserver gateway 10.0.0.1:53

frontend http-in
    bind *:80

    acl domainA_req hdr(host) -i domainA
    use_backend domainA if domainA_req

    acl domainB_req hdr(host) -i domainB
    use_backend domainB if domainB_req

backend domainA
    balance roundrobin
    cookie SERVERID insert indirect nocache
    server foo foo:80 check resolvers dns cookie foo

backend domainB
    balance roundrobin
    cookie SERVERID insert indirect nocache
    server bar bar:80 check resolvers dns cookie bar
`;

      const domainA = [new kelda.Container('foo', 'image')];
      const domainB = [new kelda.Container('bar', 'image')];
      const hap = haproxy.withURLrouting({ domainA, domainB });
      assert.equal(hap.filepathToContent['/usr/local/etc/haproxy/haproxy.cfg'],
        expConfig);
    });
  });
});
