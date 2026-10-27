"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bootstrap_1 = require("./bootstrap");
const backupJob_1 = require("./backupJob");
const infra_1 = require("./infra");
async function main() {
    const app = await (0, bootstrap_1.createApp)();
    await (0, bootstrap_1.ensureSuperAdmin)(app.get(infra_1.PrismaService));
    const port = Number(process.env.PORT || 3000);
    await app.listen(port, '0.0.0.0');
    console.log(`MarqueePro API listening on ${port}`);
    (0, backupJob_1.startBackupSchedule)();
}
main().catch((e) => { console.error(e); process.exit(1); });
//# sourceMappingURL=main.js.map