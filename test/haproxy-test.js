/* eslint-env mocha */

const assert = require('chai').assert;
const quilt = require('@quilt/quilt');
const haproxy = require('../haproxy');

describe('haproxy', () => {
  beforeEach(() => {
    quilt.resetGlobals();
  });

  describe('singleServiceLoadBalancer', () => {
    it('config', () => {
      const service = new quilt.Service('foo', [
        new quilt.Container('bar'),
        new quilt.Container('baz'),
      ]);

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
    server default-0 1.foo.q:80 check resolvers dns cookie default-0
    server default-1 2.foo.q:80 check resolvers dns cookie default-1
`;

      const hap = haproxy.singleServiceLoadBalancer(1, service);
      assert.equal(hap.containers[0].filepathToContent['/usr/local/etc/haproxy/haproxy.cfg'],
        expConfig);
    });
  });

  describe('withURLrouting', () => {
    it('config', () => {
      const serviceA = new quilt.Service('foo', [
        new quilt.Container('bar'),
      ]);
      const serviceB = new quilt.Service('baz', [
        new quilt.Container('quux'),
      ]);

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

    acl serviceA_req hdr(host) -i serviceA
    use_backend serviceA if serviceA_req

    acl serviceB_req hdr(host) -i serviceB
    use_backend serviceB if serviceB_req

backend serviceA
    balance roundrobin
    cookie SERVERID insert indirect nocache
    server serviceA-0 1.foo.q:80 check resolvers dns cookie serviceA-0

backend serviceB
    balance roundrobin
    cookie SERVERID insert indirect nocache
    server serviceB-0 1.baz.q:80 check resolvers dns cookie serviceB-0
`;

      const hap = haproxy.withURLrouting(1, { serviceA, serviceB });
      assert.equal(hap.containers[0].filepathToContent['/usr/local/etc/haproxy/haproxy.cfg'],
        expConfig);
    });
  });
});
