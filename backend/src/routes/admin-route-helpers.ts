// Shim legacy: usar el modulo Administracion para codigo nuevo.
export {
  hasOwn,
  hasSqliteConstraint,
  normalizeOptionalText,
  normalizeRequiredText,
  readPasswordFromBody,
} from "../modules/administracion/http/route-helpers";
