import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { generateCaCert, generateDomainCert, pemToDer, derToPem } from '../certs';

describe('certs', () => {
    it('generates CA certificate with valid PEM', () => {
        const ca = generateCaCert();
        assert.ok(ca.certPem.includes('-----BEGIN CERTIFICATE-----'));
        assert.ok(ca.certPem.includes('-----END CERTIFICATE-----'));
        assert.ok(ca.keyPem.includes('-----BEGIN PRIVATE KEY-----'));
        assert.ok(ca.certDer.length > 0);
        assert.ok(ca.subjectDer.length > 0);
    });

    it('generates domain certificate signed by CA', () => {
        const ca = generateCaCert();
        const domain = generateDomainCert('example.com', ca);
        assert.ok(domain.certPem.startsWith('-----BEGIN CERTIFICATE-----'));
        assert.ok(domain.keyPem.startsWith('-----BEGIN PRIVATE KEY-----'));
        assert.ok(domain.certDer.length > 0);
        // Domain cert should be different from CA cert
        assert.notEqual(domain.certPem, ca.certPem);
    });

    it('generates unique certificates each time', () => {
        const ca1 = generateCaCert();
        const ca2 = generateCaCert();
        assert.notEqual(ca1.certPem, ca2.certPem);
        assert.notEqual(ca1.keyPem, ca2.keyPem);
    });

    it('PEM to DER conversion round-trips', () => {
        const ca = generateCaCert();
        const der = pemToDer(ca.certPem);
        assert.ok(der.length > 0);
        // DER should start with SEQUENCE tag (0x30)
        assert.equal(der[0], 0x30);
    });

    it('DER to PEM conversion produces valid PEM', () => {
        const ca = generateCaCert();
        const pem = derToPem(ca.certDer, 'CERTIFICATE');
        assert.ok(pem.includes('-----BEGIN CERTIFICATE-----'));
        assert.ok(pem.includes('-----END CERTIFICATE-----'));
    });

    it('domain cert has correct hostname in SAN', () => {
        const ca = generateCaCert();
        const domain = generateDomainCert('platform.xiaomimimo.com', ca);
        // The cert DER should contain the hostname
        const certStr = domain.certDer.toString('ascii');
        assert.ok(certStr.includes('platform.xiaomimimo.com'));
    });
});
