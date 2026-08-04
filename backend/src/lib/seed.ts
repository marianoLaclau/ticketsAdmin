import { db, rolesTable, sesionesTable, usuariosTable } from "@workspace/db";
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./passwords";
import { logger } from "./logger";
import { ROL_SYSADMIN, ROL_ADMINISTRADOR, ROL_OPERADOR } from "./rbac";

const ROLES_BASE: Array<{ nombre: string; descripcion: string }> = [
  {
    nombre: ROL_SYSADMIN,
    descripcion: "Usuario Dios: acceso total al sistema",
  },
  {
    nombre: ROL_ADMINISTRADOR,
    descripcion:
      "Gestión completa de tickets (puede cerrarlos); sin acceso al panel de administración",
  },
  {
    nombre: ROL_OPERADOR,
    descripcion: "Gestión básica de tickets; no puede cerrar tickets",
  },
];

const BOOTSTRAP_PASSWORD_ENV = "BOOTSTRAP_SYSADMIN_PASSWORD";
const BOOTSTRAP_PASSWORD_MIN_LENGTH = 16;
const BOOTSTRAP_PASSWORD_MAX_LENGTH = 128;
const LEGACY_SEED_PASSWORD = "admin";
const BOOTSTRAP_PASSWORDS_BLOQUEADAS = new Set([
  "adminadminadminadmin",
  "sysadminsysadmin",
  "passwordpassword",
  "changemechangeme",
  "generar-una-clave-inicial-larga-y-unica",
]);

type AccionCuenta = "ninguna" | "inicializada" | "rotada";

interface SeedHeredado {
  id: number;
  passwordHash: string;
}

interface ResultadoSeed {
  accionCuenta: AccionCuenta;
  usuarioIds: number[];
  usuarioRenombrado: boolean;
  usuarioPromovido: boolean;
  rolesCreados: string[];
  rolesReactivados: string[];
}

function leerPasswordBootstrap(): string {
  const password = process.env[BOOTSTRAP_PASSWORD_ENV];

  if (!password) {
    throw new Error(
      `${BOOTSTRAP_PASSWORD_ENV} es obligatoria para inicializar o asegurar el usuario semilla`,
    );
  }

  if (password !== password.trim()) {
    throw new Error(
      `${BOOTSTRAP_PASSWORD_ENV} no puede comenzar ni terminar con espacios`,
    );
  }

  if (
    password.length < BOOTSTRAP_PASSWORD_MIN_LENGTH ||
    password.length > BOOTSTRAP_PASSWORD_MAX_LENGTH
  ) {
    throw new Error(
      `${BOOTSTRAP_PASSWORD_ENV} debe tener entre ${BOOTSTRAP_PASSWORD_MIN_LENGTH} y ${BOOTSTRAP_PASSWORD_MAX_LENGTH} caracteres`,
    );
  }

  if (BOOTSTRAP_PASSWORDS_BLOQUEADAS.has(password.toLocaleLowerCase("en-US"))) {
    throw new Error(
      `${BOOTSTRAP_PASSWORD_ENV} no puede ser una clave conocida o de ejemplo`,
    );
  }

  return password;
}

async function buscarSeedsHeredados(): Promise<SeedHeredado[]> {
  const candidatos = db
    .select({
      id: usuariosTable.id,
      passwordHash: usuariosTable.password_hash,
    })
    .from(usuariosTable)
    .where(
      or(
        inArray(usuariosTable.email, ["sysadmin", "admin"]),
        inArray(usuariosTable.username, ["sysadmin", "admin"]),
      ),
    )
    .all();
  const evaluados = await Promise.all(
    candidatos.map(async (candidato) => ({
      candidato,
      heredado:
        Boolean(candidato.passwordHash) &&
        (await verifyPassword(LEGACY_SEED_PASSWORD, candidato.passwordHash)),
    })),
  );
  return evaluados
    .filter(({ heredado }) => heredado)
    .map(({ candidato }) => ({
      id: candidato.id,
      passwordHash: candidato.passwordHash!,
    }));
}

/**
 * Mantiene los roles base y garantiza un bootstrap seguro del SysAdmin.
 *
 * Una base nueva exige BOOTSTRAP_SYSADMIN_PASSWORD. La misma variable rota
 * exclusivamente la credencial conocida creada por versiones antiguas y
 * revoca sus sesiones. Cualquier otra contraseña existente queda intacta.
 */
export async function ensureAdminSeed(): Promise<void> {
  const existePassword = Boolean(
    db
      .select({ id: usuariosTable.id })
      .from(usuariosTable)
      .where(isNotNull(usuariosTable.password_hash))
      .limit(1)
      .get(),
  );
  const seedsHeredados = await buscarSeedsHeredados();
  const requiereBootstrap = !existePassword || seedsHeredados.length > 0;
  const bootstrapPassword = requiereBootstrap ? leerPasswordBootstrap() : null;
  const hashInicial =
    !existePassword && bootstrapPassword
      ? await hashPassword(bootstrapPassword)
      : null;
  const rotaciones = bootstrapPassword
    ? await Promise.all(
        seedsHeredados.map(async (seed) => ({
          ...seed,
          nuevoHash: await hashPassword(bootstrapPassword),
        })),
      )
    : [];

  // Todas las mutaciones del seed son atómicas. En particular, una rotación
  // nunca confirma el hash nuevo si no pudo revocar también sus sesiones.
  const resultado = db.transaction((tx): ResultadoSeed => {
    let usuarioRenombrado = false;
    let usuarioPromovido = false;
    const rolesCreados: string[] = [];
    const rolesReactivados: string[] = [];

    const userSysadmin = tx
      .select({ id: usuariosTable.id })
      .from(usuariosTable)
      .where(eq(usuariosTable.email, "sysadmin"))
      .get();
    const userViejo = tx
      .select({ id: usuariosTable.id })
      .from(usuariosTable)
      .where(eq(usuariosTable.email, "admin"))
      .get();
    const usuarioSeedCanonicoId = userSysadmin?.id ?? userViejo?.id ?? null;
    if (userViejo && !userSysadmin) {
      tx.update(usuariosTable)
        .set({
          email: "sysadmin",
          nombre: "SysAdmin",
          fecha_actualizacion: new Date(),
        })
        .where(eq(usuariosTable.id, userViejo.id))
        .run();
      usuarioRenombrado = true;
    }

    tx.update(usuariosTable)
      .set({ username: sql`${usuariosTable.email}` })
      .where(isNull(usuariosTable.username))
      .run();

    for (const base of ROLES_BASE) {
      const existe = tx
        .select({ id: rolesTable.id, activo: rolesTable.activo })
        .from(rolesTable)
        .where(eq(rolesTable.nombre, base.nombre))
        .get();
      if (!existe) {
        tx.insert(rolesTable).values(base).run();
        rolesCreados.push(base.nombre);
      } else if (!existe.activo) {
        tx.update(rolesTable)
          .set({ activo: true, fecha_actualizacion: new Date() })
          .where(eq(rolesTable.id, existe.id))
          .run();
        rolesReactivados.push(base.nombre);
      }
    }

    const rolSysAdmin = tx
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.nombre, ROL_SYSADMIN))
      .get();
    if (!rolSysAdmin) {
      throw new Error("No se pudo garantizar el rol base SysAdmin");
    }

    // Solo la identidad canónica del seed recibe SysAdmin. Una instalación
    // antigua puede haber cambiado su contraseña antes de incorporar el rol
    // nuevo; en ese caso también hay que migrarla sin promover al resto de
    // usuarios de Administrador ni a homónimos que coexistan con sysadmin.
    if (usuarioSeedCanonicoId !== null) {
      const usuarioCanonico = tx
        .select({ roleId: usuariosTable.role_id })
        .from(usuariosTable)
        .where(eq(usuariosTable.id, usuarioSeedCanonicoId))
        .get();
      if (usuarioCanonico && usuarioCanonico.roleId !== rolSysAdmin.id) {
        tx.update(usuariosTable)
          .set({
            role_id: rolSysAdmin.id,
            fecha_actualizacion: new Date(),
          })
          .where(eq(usuariosTable.id, usuarioSeedCanonicoId))
          .run();
        tx.delete(sesionesTable)
          .where(eq(sesionesTable.usuario_id, usuarioSeedCanonicoId))
          .run();
        usuarioPromovido = true;
      }
    }

    if (rotaciones.length > 0) {
      for (const rotacion of rotaciones) {
        const actualizacion = tx
          .update(usuariosTable)
          .set({
            password_hash: rotacion.nuevoHash,
            fecha_actualizacion: new Date(),
          })
          .where(
            and(
              eq(usuariosTable.id, rotacion.id),
              eq(usuariosTable.password_hash, rotacion.passwordHash),
            ),
          )
          .run();
        if (actualizacion.changes !== 1) {
          throw new Error(
            "Una credencial heredada cambió durante el bootstrap; no se aplicó una rotación parcial",
          );
        }

        tx.delete(sesionesTable)
          .where(eq(sesionesTable.usuario_id, rotacion.id))
          .run();
      }

      return {
        accionCuenta: "rotada",
        usuarioIds: rotaciones.map(({ id }) => id),
        usuarioRenombrado,
        usuarioPromovido,
        rolesCreados,
        rolesReactivados,
      };
    }

    if (!hashInicial) {
      return {
        accionCuenta: "ninguna",
        usuarioIds: [],
        usuarioRenombrado,
        usuarioPromovido,
        rolesCreados,
        rolesReactivados,
      };
    }

    // Defensa ante una inicialización concurrente entre la lectura y el
    // comienzo de la transacción: nunca se pisa una contraseña recién creada.
    const passwordActual = tx
      .select({ id: usuariosTable.id })
      .from(usuariosTable)
      .where(isNotNull(usuariosTable.password_hash))
      .limit(1)
      .get();
    if (passwordActual) {
      return {
        accionCuenta: "ninguna",
        usuarioIds: [],
        usuarioRenombrado,
        usuarioPromovido,
        rolesCreados,
        rolesReactivados,
      };
    }

    let rol = tx
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.nombre, ROL_SYSADMIN))
      .get();
    if (!rol) {
      rol = tx
        .insert(rolesTable)
        .values({
          nombre: ROL_SYSADMIN,
          descripcion: "Usuario Dios: acceso total al sistema",
        })
        .returning()
        .get();
      rolesCreados.push(ROL_SYSADMIN);
    }

    const existente = tx
      .select({ id: usuariosTable.id })
      .from(usuariosTable)
      .where(eq(usuariosTable.email, "sysadmin"))
      .get();
    let usuarioId: number;
    if (existente) {
      tx.update(usuariosTable)
        .set({
          username: "sysadmin",
          password_hash: hashInicial,
          activo: true,
          role_id: rol.id,
          fecha_actualizacion: new Date(),
        })
        .where(eq(usuariosTable.id, existente.id))
        .run();
      usuarioId = existente.id;
    } else {
      const creado = tx
        .insert(usuariosTable)
        .values({
          nombre: "SysAdmin",
          apellido: null,
          username: "sysadmin",
          email: "sysadmin",
          role_id: rol.id,
          password_hash: hashInicial,
        })
        .returning({ id: usuariosTable.id })
        .get();
      usuarioId = creado.id;
    }

    return {
      accionCuenta: "inicializada",
      usuarioIds: [usuarioId],
      usuarioRenombrado,
      usuarioPromovido,
      rolesCreados,
      rolesReactivados,
    };
  });

  if (resultado.usuarioRenombrado) {
    logger.info('Usuario "admin" renombrado a "sysadmin"');
  }
  if (resultado.usuarioPromovido) {
    logger.warn(
      "La identidad histórica del seed fue asignada al rol SysAdmin y sus sesiones fueron revocadas",
    );
  }
  for (const rol of resultado.rolesCreados) {
    logger.info({ rol }, "Rol base creado");
  }
  for (const rol of resultado.rolesReactivados) {
    logger.warn({ rol }, "Rol base reactivado por la política RBAC");
  }
  if (resultado.accionCuenta === "inicializada") {
    logger.info(
      { usuarioId: resultado.usuarioIds[0] },
      'Usuario semilla "sysadmin" inicializado con una clave externa',
    );
  } else if (resultado.accionCuenta === "rotada") {
    logger.warn(
      { usuarioIds: resultado.usuarioIds },
      "Credenciales heredadas del seed rotadas y sesiones anteriores revocadas",
    );
  }
}
