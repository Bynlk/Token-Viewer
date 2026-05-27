import * as crypto from 'crypto';
import { CertAndKey, CaMaterial } from './types';

// ============================================================
// ASN.1 DER 编码原语（用于 X.509 证书生成）
// ============================================================

const OID = {
    rsaEncryption:    '1.2.840.113549.1.1.1',
    sha256WithRSA:    '1.2.840.113549.1.1.11',
    commonName:       '2.5.4.3',
    countryName:      '2.5.4.6',
    organizationName: '2.5.4.10',
    basicConstraints: '2.5.29.19',
    subjectAltName:   '2.5.29.17',
    keyUsage:         '2.5.29.15',
};

function derLength(len: number): Buffer {
    if (len < 0x80) { return Buffer.from([len]); }
    if (len < 0x100) { return Buffer.from([0x81, len]); }
    return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
}

function derTlv(tag: number, content: Buffer): Buffer {
    return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
}

function derSequence(...buffers: Buffer[]): Buffer {
    return derTlv(0x30, Buffer.concat(buffers));
}

function derSet(...buffers: Buffer[]): Buffer {
    return derTlv(0x31, Buffer.concat(buffers));
}

function derInteger(value: Buffer): Buffer {
    if (value[0] & 0x80) {
        return derTlv(0x02, Buffer.concat([Buffer.from([0x00]), value]));
    }
    return derTlv(0x02, value);
}

function derBitString(data: Buffer): Buffer {
    return derTlv(0x03, Buffer.concat([Buffer.from([0x00]), data]));
}

function derOid(oid: string): Buffer {
    const parts = oid.split('.').map(Number);
    const bytes: number[] = [];
    bytes.push(parts[0] * 40 + parts[1]);
    for (let i = 2; i < parts.length; i++) {
        let val = parts[i];
        const stack: number[] = [];
        stack.push(val & 0x7f);
        val >>= 7;
        while (val > 0) {
            stack.push((val & 0x7f) | 0x80);
            val >>= 7;
        }
        bytes.push(...stack.reverse());
    }
    return derTlv(0x06, Buffer.from(bytes));
}

function derUtf8String(str: string): Buffer {
    return derTlv(0x0c, Buffer.from(str, 'utf8'));
}

function derNull(): Buffer {
    return Buffer.from([0x05, 0x00]);
}

function derExplicitTag(tag: number, content: Buffer): Buffer {
    return derTlv(0xa0 | tag, content);
}

function derOctetString(data: Buffer): Buffer {
    return derTlv(0x04, data);
}

function derUtcTime(date: Date): Buffer {
    const y = date.getUTCFullYear();
    const yy = y >= 2000 ? y - 2000 : y;
    const str =
        String(yy).padStart(2, '0') +
        String(date.getUTCMonth() + 1).padStart(2, '0') +
        String(date.getUTCDate()).padStart(2, '0') +
        String(date.getUTCHours()).padStart(2, '0') +
        String(date.getUTCMinutes()).padStart(2, '0') +
        String(date.getUTCSeconds()).padStart(2, '0') + 'Z';
    return derTlv(0x17, Buffer.from(str, 'ascii'));
}

export function pemToDer(pem: string): Buffer {
    const base64 = pem.replace(/-----.*-----/g, '').replace(/\s/g, '');
    return Buffer.from(base64, 'base64');
}

export function derToPem(der: Buffer, type: string): string {
    const base64 = der.toString('base64');
    const lines = base64.match(/.{1,64}/g) || [];
    return `-----BEGIN ${type}-----\n${lines.join('\n')}\n-----END ${type}-----`;
}

// ============================================================
// RSA 密钥对和 X.509 证书生成
// ============================================================

function generateRsaKeyPair(): { privateKeyPem: string; publicKeyDer: Buffer } {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'der' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return { privateKeyPem: privateKey, publicKeyDer: publicKey };
}

function buildNameRdn(oid: string, value: string): Buffer {
    return derSet(derSequence(derOid(oid), derUtf8String(value)));
}

function buildValidity(notBefore: Date, notAfter: Date): Buffer {
    return derSequence(derUtcTime(notBefore), derUtcTime(notAfter));
}

function signTbs(tbsDer: Buffer, keyPem: string): Buffer {
    return crypto.createSign('SHA256').update(tbsDer).sign(keyPem);
}

function buildSignedCert(tbsDer: Buffer, keyPem: string): Buffer {
    const signature = signTbs(tbsDer, keyPem);
    return derSequence(
        tbsDer,
        derSequence(derOid(OID.sha256WithRSA), derNull()),
        derBitString(signature)
    );
}

export function generateCaCert(): CaMaterial {
    const { privateKeyPem, publicKeyDer } = generateRsaKeyPair();
    const serial = Buffer.from(crypto.randomBytes(8));
    serial[0] &= 0x7f;

    const now = new Date();
    const tenYears = new Date(now);
    tenYears.setFullYear(tenYears.getFullYear() + 10);

    const subjectDer = Buffer.concat([
        buildNameRdn(OID.countryName, 'CN'),
        buildNameRdn(OID.organizationName, 'Token Viewer'),
        buildNameRdn(OID.commonName, 'Token Viewer Local CA'),
    ]);

    const extensions = derSequence(
        derSequence(
            derOid(OID.basicConstraints),
            derOctetString(derSequence(Buffer.from([0x01])))
        ),
        derSequence(
            derOid(OID.keyUsage),
            derOctetString(derBitString(Buffer.from([0x06])))
        )
    );

    const tbs = derSequence(
        derExplicitTag(0, derInteger(Buffer.from([0x02]))),
        derInteger(serial),
        derSequence(derOid(OID.sha256WithRSA), derNull()),
        subjectDer,
        buildValidity(now, tenYears),
        subjectDer,
        derSequence(derOid(OID.rsaEncryption), derNull()),
        derBitString(publicKeyDer),
        derExplicitTag(3, extensions)
    );

    const certDer = buildSignedCert(tbs, privateKeyPem);
    return {
        certPem: derToPem(certDer, 'CERTIFICATE'),
        keyPem: privateKeyPem,
        certDer,
        subjectDer,
    };
}

export function generateDomainCert(hostname: string, ca: CaMaterial): CertAndKey {
    const { privateKeyPem, publicKeyDer } = generateRsaKeyPair();
    const serial = Buffer.from(crypto.randomBytes(8));
    serial[0] &= 0x7f;

    const now = new Date();
    const oneYear = new Date(now);
    oneYear.setFullYear(oneYear.getFullYear() + 1);

    const subjectDer = Buffer.concat([
        buildNameRdn(OID.commonName, hostname),
    ]);

    const sanEntry = derTlv(0x82, Buffer.from(hostname, 'ascii'));
    const extensions = derSequence(
        derSequence(
            derOid(OID.basicConstraints),
            derOctetString(derSequence(Buffer.from([0x00])))
        ),
        derSequence(
            derOid(OID.subjectAltName),
            derOctetString(derSequence(sanEntry))
        )
    );

    const tbs = derSequence(
        derExplicitTag(0, derInteger(Buffer.from([0x02]))),
        derInteger(serial),
        derSequence(derOid(OID.sha256WithRSA), derNull()),
        ca.subjectDer,
        buildValidity(now, oneYear),
        subjectDer,
        derSequence(derOid(OID.rsaEncryption), derNull()),
        derBitString(publicKeyDer),
        derExplicitTag(3, extensions)
    );

    const certDer = buildSignedCert(tbs, ca.keyPem);
    return {
        certPem: derToPem(certDer, 'CERTIFICATE'),
        keyPem: privateKeyPem,
        certDer,
    };
}
