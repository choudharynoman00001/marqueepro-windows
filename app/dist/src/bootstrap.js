"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
exports.ensureSuperAdmin = ensureSuperAdmin;
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const express = __importStar(require("express"));
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const app_module_1 = require("./app.module");
const L = __importStar(require("./lib"));
async function createApp(opts = {}) {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { logger: ['error', 'warn'] });
    app.disable('x-powered-by');
    app.set('trust proxy', 1);
    app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'same-origin');
        res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
        if (req.path.startsWith('/api'))
            res.setHeader('Cache-Control', 'no-store');
        next();
    });
    app.use('/healthz', (_q, r) => r.json({ ok: true }));
    const webDir = opts.webDir || path.join(__dirname, '..', '..', '..', 'apps', 'web', 'dist');
    if (fs.existsSync(webDir)) {
        app.use(express.static(webDir, { index: false, maxAge: '1h' }));
        app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/_scc') ? res.sendFile(path.join(webDir, 'index.html')) : next()));
    }
    await app.init();
    return app;
}
/** First start: create the platform super admin. Password comes from env or is generated and written to a 0600 file, never logged. */
async function ensureSuperAdmin(prisma) {
    await prisma.scoped({ system: true }, async (db) => {
        if (await db.get("SELECT 1 x FROM users WHERE role='super' LIMIT 1"))
            return;
        const username = process.env.SUPERADMIN_USERNAME || 'platformadmin';
        const given = process.env.SUPERADMIN_PASSWORD;
        const pw = given || L.randomPassword(16);
        await db.run("INSERT INTO users(tenant_id,username,name,password_hash,role,must_change_password,created_at) VALUES(NULL,?,?,?,'super',?,?)", username, 'Platform admin', L.hashPassword(pw), given ? 0 : 1, L.nowIso());
        if (!given) {
            const f = path.join(process.env.DATA_DIR || '.', 'bootstrap-admin.txt');
            fs.writeFileSync(f, `username: ${username}\npassword: ${pw}\n(first login forces a password change; delete this file afterwards)\n`, { mode: 0o600 });
            console.log(`[bootstrap] platform admin '${username}' created; one-time password written to ${f}`);
        }
    });
}
//# sourceMappingURL=bootstrap.js.map