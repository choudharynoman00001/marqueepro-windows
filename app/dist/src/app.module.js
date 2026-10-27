"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const infra_1 = require("./infra");
const controllers_1 = require("./controllers");
const ops_1 = require("./ops");
const ops2_1 = require("./ops2");
const integrations_1 = require("./integrations");
const acct_1 = require("./acct");
const kitchen_1 = require("./kitchen");
const po_1 = require("./po");
const scc_1 = require("./scc");
const CONTROLLERS = [...controllers_1.CONTROLLERS, ...ops_1.OPS_CONTROLLERS, ...ops2_1.OPS2_CONTROLLERS, ...integrations_1.INTEGRATION_CONTROLLERS, ...acct_1.ACCT_CONTROLLERS, ...kitchen_1.KITCHEN_CONTROLLERS, ...po_1.PO_CONTROLLERS, ...scc_1.SCC_CONTROLLERS];
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        controllers: CONTROLLERS,
        providers: [infra_1.PrismaService, { provide: core_1.APP_GUARD, useClass: infra_1.AuthGuard }, { provide: core_1.APP_INTERCEPTOR, useClass: infra_1.TxInterceptor }, { provide: core_1.APP_FILTER, useClass: infra_1.AllExceptions }],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map