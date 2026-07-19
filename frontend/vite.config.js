var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _a;
import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
var BACKEND_PORT = Number((_a = process.env.BACKEND_PORT) !== null && _a !== void 0 ? _a : 3847);
/**
 * react-draggable calls `process.env.DRAGGABLE_DEBUG` inside log() on every
 * mousedown. In the browser `process` is undefined → ReferenceError → drag never starts.
 */
function rewriteDraggableDebug(code) {
    return code.split('process.env.DRAGGABLE_DEBUG').join('(typeof process !== "undefined" && process.env && process.env.DRAGGABLE_DEBUG)');
}
function esbuildShimDraggableDebug() {
    return {
        name: 'shim-draggable-debug-esbuild',
        setup: function (build) {
            var _this = this;
            build.onLoad({ filter: /[\\/]react-draggable[\\/].*\.m?js$/ }, function (args) { return __awaiter(_this, void 0, void 0, function () {
                var source;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fs.promises.readFile(args.path, 'utf8')];
                        case 1:
                            source = _a.sent();
                            if (!source.includes('process.env.DRAGGABLE_DEBUG'))
                                return [2 /*return*/, null];
                            return [2 /*return*/, {
                                    contents: rewriteDraggableDebug(source),
                                    loader: 'js',
                                }];
                    }
                });
            }); });
        },
    };
}
function shimDraggableDebug() {
    return {
        name: 'shim-draggable-debug',
        enforce: 'pre',
        transform: function (code, id) {
            if (!id.includes('react-draggable') && !id.includes('react-grid-layout'))
                return null;
            if (!code.includes('process.env.DRAGGABLE_DEBUG'))
                return null;
            return { code: rewriteDraggableDebug(code), map: null };
        },
    };
}
export default defineConfig({
    plugins: [react(), shimDraggableDebug()],
    define: {
        'process.env.DRAGGABLE_DEBUG': JSON.stringify(''),
    },
    optimizeDeps: {
        esbuildOptions: {
            plugins: [esbuildShimDraggableDebug()],
        },
    },
    server: {
        host: true,
        port: 5173,
        proxy: {
            '/api': {
                target: "http://localhost:".concat(BACKEND_PORT),
                changeOrigin: true,
            },
            '/ws': {
                target: "ws://localhost:".concat(BACKEND_PORT),
                ws: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
});
