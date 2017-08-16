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

    default_backend foo

backend foo
    balance roundrobin
    cookie SERVERID insert indirect nocache
    server foo-0 1.foo.q:80 check resolvers dns cookie foo-0
    server foo-1 2.foo.q:80 check resolvers dns cookie foo-1
`;

      const hap = haproxy.singleServiceLoadBalancer(1, service);
      assert.deepEqual(hap.containers[0].filepathToContent,
        { '/usr/local/etc/haproxy/haproxy.cfg': expConfig });
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

    acl foo_req hdr(host) -i serviceA
    acl baz_req hdr(host) -i serviceB
    use_backend foo if foo_req
    use_backend baz if baz_req

backend foo
    balance roundrobin
    cookie SERVERID insert indirect nocache
    server foo-0 1.foo.q:80 check resolvers dns cookie foo-0

backend baz
    balance roundrobin
    cookie SERVERID insert indirect nocache
    server baz-0 1.baz.q:80 check resolvers dns cookie baz-0
`;

      const hap = haproxy.withURLrouting(1, { serviceA, serviceB });
      assert.deepEqual(hap.containers[0].filepathToContent,
        { '/usr/local/etc/haproxy/haproxy.cfg': expConfig });
    });
  });
});
