// registry/scripts/genLogKeys.js
// Generate a fresh Ed25519 keypair for the OAP transparency log.
//
// Usage:
//   node registry/scripts/genLogKeys.js

const nacl = require("tweetnacl");

const kp = nacl.sign.keyPair();
const pub = Buffer.from(kp.publicKey).toString("base64");
const sec = Buffer.from(kp.secretKey).toString("base64");

console.log("Generated Ed25519 keypair for OAP transparency log:\n");
console.log(`OAP_LOG_PUBLIC_KEY_B64=${pub}`);
console.log(`OAP_LOG_SECRET_KEY_B64=${sec}`);
console.log(`
─────────────────────────────────────────────────────────
Set these before running the registry server or oap publish.

  bash / zsh:
    export OAP_LOG_PUBLIC_KEY_B64=${pub}
    export OAP_LOG_SECRET_KEY_B64=${sec}

  CMD:
    set OAP_LOG_PUBLIC_KEY_B64=${pub}
    set OAP_LOG_SECRET_KEY_B64=${sec}

  PowerShell:
    $env:OAP_LOG_PUBLIC_KEY_B64="${pub}"
    $env:OAP_LOG_SECRET_KEY_B64="${sec}"
─────────────────────────────────────────────────────────
Keep the secret key private. The public key can be shared.
`);
