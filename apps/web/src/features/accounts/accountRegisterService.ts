import { mockAccountRegisterService } from "./mockAccountRegisterService";
import type { AccountRegisterService } from "./accountRegisterTypes";

/**
 * Browser-facing register service boundary.
 *
 * The register hook should depend on this port instead of importing the mock
 * service directly. For desktop, this can be replaced by a Tauri-backed adapter
 * that calls the real application services without changing the React page.
 */
export const accountRegisterService: AccountRegisterService = mockAccountRegisterService;
