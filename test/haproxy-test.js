/* eslint-env mocha */

const assert = require('chai').assert;
const quilt = require('@quilt/quilt');
const haproxy = require('../haproxy');

describe('haproxy', () => {
  beforeEach(() => {
    quilt.resetGlobals();
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
    server foo2.q foo2.q:80 check resolvers dns cookie foo2.q
    server foo3.q foo3.q:80 check resolvers dns cookie foo3.q
`;

      const containers = new quilt.Container('foo', 'image').replicate(2);
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
    server foo.q foo.q:80 check resolvers dns cookie foo.q

backend domainB
    balance roundrobin
    cookie SERVERID insert indirect nocache
    server bar.q bar.q:80 check resolvers dns cookie bar.q
`;

      const domainA = [new quilt.Container('foo', 'image')];
      const domainB = [new quilt.Container('bar', 'image')];
      const hap = haproxy.withURLrouting({ domainA, domainB });
      assert.equal(hap.filepathToContent['/usr/local/etc/haproxy/haproxy.cfg'],
        expConfig);
    });
  });
});
