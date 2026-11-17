import { describe, expect, it } from 'vitest';
import { AuditAction } from '@/application/ports/services/IAuditLogger.js';
import { canManageRole } from '@/application/policies/authorizationPolicy.js';
import { PasswordPolicy } from '@/application/services/PasswordPolicy.js';
import { SessionIssuer } from '@/application/services/SessionIssuer.js';
import { AcceptInvitationUseCase } from '@/application/use-case/auth/AcceptInvitationUseCase.js';
import {
  InviteUserUseCase,
  ListTenantUsersUseCase,
  ListUserInvitationsUseCase,
  RevokeUserInvitationUseCase,
  UpdateTenantUserUseCase,
} from '@/application/use-case/users/TenantUserUseCases.js';
import { Tenant } from '@/domain/entities/Tenant.js';
import { SessionRevocationReason } from '@/domain/entities/UserSession.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { DEFAULT_TEST_TENANT_ID, buildUser } from '@tests/support/builders/entityBuilders.js';
import { createAccountMailing } from '@tests/support/doubles/accountMailing.js';
import { FakeAuthTokenService } from '@tests/support/doubles/FakeAuthTokenService.js';
import { FakeBreachedPasswordChecker } from '@tests/support/doubles/FakeBreachedPasswordChecker.js';
import { FakeHashService } from '@tests/support/doubles/FakeHashService.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemorySessionRepository } from '@tests/support/doubles/InMemorySessionRepository.js';
import { InMemoryTenantRepository } from '@tests/support/doubles/InMemoryTenantRepository.js';
import { InMemoryUserInvitationRepository } from '@tests/support/doubles/InMemoryUserInvitationRepository.js';
import { InMemoryUserRepository } from '@tests/support/doubles/InMemoryUserRepository.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';
import { RecordingTransactionManager } from '@tests/support/doubles/RecordingTransactionManager.js';

// F2-T05 (D-16, D-17): usuarios de la empresa e invitaciones.

const INVITEE_EMAIL = 'nueva.comercial@example.com';
const INVITEE_PASSWORD = 'Invited-Horse-Battery-5';
const SESSION_LIFETIME_MS = 604_800_000;
const TOKEN_IN_LINK_PATTERN = /#token=([^\s"&]+)/;

async function setupTeam() {
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
  const userRepository = new InMemoryUserRepository(tenantContext);
  const invitationRepository = new InMemoryUserInvitationRepository(tenantContext);
  const sessionRepository = new InMemorySessionRepository();
  const tenantRepository = new InMemoryTenantRepository();
  await tenantRepository.create(new Tenant(DEFAULT_TEST_TENANT_ID, 'Aluminios Andinos SAS'));
  const team = {
    owner: buildUser({ role: Role.OWNER, firstName: 'Carlos', lastName: 'Pérez' }),
    partner: buildUser({ role: Role.PARTNER }),
    otherPartner: buildUser({ role: Role.PARTNER }),
    salesLeader: buildUser({ role: Role.SALES_LEADER }),
    salesRep: buildUser({ role: Role.SALES_REP }),
  };
  userRepository.seed(...Object.values(team));
  const mailing = createAccountMailing();
  const auditLogger = new RecordingAuditLogger();
  const transactionManager = new RecordingTransactionManager();
  const dependencies = {
    userRepository,
    invitationRepository,
    sessionRepository,
    tenantRepository,
    transactionManager,
    auditLogger,
    emailSender: mailing.emailSender,
    accountLinks: mailing.accountLinks,
  };
  const sessionIssuer = new SessionIssuer(sessionRepository, new FakeAuthTokenService(), {
    refreshTokenLifetimeMs: SESSION_LIFETIME_MS,
  });
  return {
    team,
    userRepository,
    invitationRepository,
    sessionRepository,
    mailing,
    auditLogger,
    sessionIssuer,
    listUsers: new ListTenantUsersUseCase(userRepository),
    listInvitations: new ListUserInvitationsUseCase(invitationRepository),
    invite: new InviteUserUseCase(dependencies),
    revoke: new RevokeUserInvitationUseCase(dependencies),
    update: new UpdateTenantUserUseCase(dependencies),
    accept: new AcceptInvitationUseCase({
      invitationRepository,
      userRepository,
      tenantRepository,
      hashService: new FakeHashService(),
      passwordPolicy: new PasswordPolicy(new FakeBreachedPasswordChecker()),
      sessionIssuer,
      transactionManager,
      auditLogger,
    }),
  };
}

function actorOf(user: { role: Role; id: string }) {
  return { role: user.role, userId: user.id };
}

function invitationTokenFrom(mailing: ReturnType<typeof createAccountMailing>, email: string): string {
  const match = TOKEN_IN_LINK_PATTERN.exec(mailing.outbox.sentTo(email).at(-1)?.text ?? '');
  return decodeURIComponent(match?.[1] ?? '');
}

describe('canManageRole (D-16, D-17)', () => {
  it.each([
    [Role.OWNER, Role.PARTNER, true],
    [Role.OWNER, Role.OWNER, false],
    [Role.PARTNER, Role.PARTNER, true],
    [Role.PARTNER, Role.OWNER, false],
    [Role.SALES_LEADER, Role.SALES_REP, true],
    [Role.SALES_LEADER, Role.SALES_LEADER, false],
    [Role.SALES_LEADER, Role.PARTNER, false],
    [Role.SALES_REP, Role.SALES_REP, false],
  ])('%s gestiona a %s: %s', (actorRole, targetRole, expected) => {
    expect(canManageRole({ role: actorRole }, targetRole)).toBe(expected);
  });

  it('un rol desconocido no gestiona a nadie', () => {
    expect(canManageRole({ role: 'UNKNOWN' as Role }, Role.SALES_REP)).toBe(false);
  });
});

describe('Invitar usuarios', () => {
  it('el dueño invita a un comercial: guarda la invitación, la audita y envía el enlace', async () => {
    const { invite, team, invitationRepository, mailing, auditLogger } = await setupTeam();

    const invitation = await invite.execute(actorOf(team.owner), { email: INVITEE_EMAIL, role: Role.SALES_REP });

    expect(invitation).toMatchObject({ email: INVITEE_EMAIL, role: Role.SALES_REP, invitedById: team.owner.id });
    expect(invitation).not.toHaveProperty('tokenHash');
    expect(invitationRepository.listStored()).toHaveLength(1);
    expect(auditLogger.entries.map((entry) => entry.action)).toEqual([AuditAction.USER_INVITED]);
    const [invitationEmail] = mailing.outbox.sentTo(INVITEE_EMAIL);
    expect(invitationEmail.subject).toBe('Carlos Pérez te invitó a Aluminios Andinos SAS en QuotesFlow');
    expect(invitationEmail.text).toContain('como comercial');
  });

  it('el líder comercial invita comerciales pero no líderes ni socios (D-17)', async () => {
    const { invite, team } = await setupTeam();

    await expect(
      invite.execute(actorOf(team.salesLeader), { email: INVITEE_EMAIL, role: Role.SALES_REP }),
    ).resolves.toBeDefined();
    await expect(
      invite.execute(actorOf(team.salesLeader), { email: 'otro@example.com', role: Role.SALES_LEADER }),
    ).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_PERMISSIONS });
  });

  it('un comercial no invita a nadie', async () => {
    const { invite, team } = await setupTeam();

    await expect(
      invite.execute(actorOf(team.salesRep), { email: INVITEE_EMAIL, role: Role.SALES_REP }),
    ).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_PERMISSIONS });
  });

  it('nadie invita a otro dueño', async () => {
    const { invite, team } = await setupTeam();

    await expect(invite.execute(actorOf(team.owner), { email: INVITEE_EMAIL, role: Role.OWNER })).rejects.toMatchObject(
      { code: ErrorCode.INSUFFICIENT_PERMISSIONS },
    );
  });

  it('un correo que ya tiene cuenta no se invita (409)', async () => {
    const { invite, team } = await setupTeam();

    await expect(
      invite.execute(actorOf(team.owner), { email: team.salesRep.email, role: Role.SALES_REP }),
    ).rejects.toMatchObject({ code: ErrorCode.EMAIL_ALREADY_IN_USE });
  });

  it('reinvitar al mismo correo anula la invitación anterior', async () => {
    const { invite, listInvitations, team, mailing, accept } = await setupTeam();
    await invite.execute(actorOf(team.owner), { email: INVITEE_EMAIL, role: Role.SALES_REP });
    const firstToken = invitationTokenFrom(mailing, INVITEE_EMAIL);

    await invite.execute(actorOf(team.owner), { email: INVITEE_EMAIL, role: Role.SALES_LEADER });

    const pending = await listInvitations.execute(actorOf(team.owner));
    expect(pending.map((invitation) => invitation.role)).toEqual([Role.SALES_LEADER]);
    await expect(
      accept.execute({ token: firstToken, password: INVITEE_PASSWORD, firstName: 'Ana', lastName: 'Ruiz' }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_ACCOUNT_TOKEN });
  });
});

describe('Aceptar una invitación', () => {
  it('crea la cuenta con el rol invitado y el correo verificado, y abre la sesión', async () => {
    const { invite, accept, team, mailing, userRepository } = await setupTeam();
    await invite.execute(actorOf(team.owner), { email: INVITEE_EMAIL, role: Role.SALES_REP });

    const session = await accept.execute({
      token: invitationTokenFrom(mailing, INVITEE_EMAIL),
      password: INVITEE_PASSWORD,
      firstName: 'Ana',
      lastName: 'Ruiz',
    });

    const createdUser = await userRepository.findByEmail(INVITEE_EMAIL);
    expect(createdUser).toMatchObject({ role: Role.SALES_REP, tenantId: DEFAULT_TEST_TENANT_ID, isActive: true });
    expect(createdUser?.isEmailVerified).toBe(true);
    expect(session.accessToken).toBeDefined();
  });

  it('la invitación sirve una sola vez', async () => {
    const { invite, accept, team, mailing } = await setupTeam();
    await invite.execute(actorOf(team.owner), { email: INVITEE_EMAIL, role: Role.SALES_REP });
    const acceptance = {
      token: invitationTokenFrom(mailing, INVITEE_EMAIL),
      password: INVITEE_PASSWORD,
      firstName: 'Ana',
      lastName: 'Ruiz',
    };
    await accept.execute(acceptance);

    await expect(accept.execute(acceptance)).rejects.toMatchObject({ code: ErrorCode.INVALID_ACCOUNT_TOKEN });
  });

  it('una invitación revocada no se acepta', async () => {
    const { invite, revoke, accept, team, mailing } = await setupTeam();
    const invitation = await invite.execute(actorOf(team.owner), { email: INVITEE_EMAIL, role: Role.SALES_REP });
    await revoke.execute(actorOf(team.owner), invitation.id);

    await expect(
      accept.execute({
        token: invitationTokenFrom(mailing, INVITEE_EMAIL),
        password: INVITEE_PASSWORD,
        firstName: 'Ana',
        lastName: 'Ruiz',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_ACCOUNT_TOKEN });
  });

  it('la contraseña cumple la política y, si no, la invitación sigue sirviendo', async () => {
    const { invite, accept, team, mailing } = await setupTeam();
    await invite.execute(actorOf(team.owner), { email: INVITEE_EMAIL, role: Role.SALES_REP });
    const token = invitationTokenFrom(mailing, INVITEE_EMAIL);

    await expect(
      accept.execute({ token, password: 'corta', firstName: 'Ana', lastName: 'Ruiz' }),
    ).rejects.toMatchObject({ code: ErrorCode.PASSWORD_TOO_WEAK });
    await expect(
      accept.execute({ token, password: INVITEE_PASSWORD, firstName: 'Ana', lastName: 'Ruiz' }),
    ).resolves.toBeDefined();
  });
});

describe('Revocar invitaciones', () => {
  it('el líder comercial no revoca la invitación de un socio', async () => {
    const { invite, revoke, team } = await setupTeam();
    const partnerInvitation = await invite.execute(actorOf(team.owner), { email: INVITEE_EMAIL, role: Role.PARTNER });

    await expect(revoke.execute(actorOf(team.salesLeader), partnerInvitation.id)).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
  });

  it('una invitación que no existe responde INVITATION_NOT_FOUND', async () => {
    const { revoke, team } = await setupTeam();

    await expect(revoke.execute(actorOf(team.owner), 'no-existe')).rejects.toMatchObject({
      code: ErrorCode.INVITATION_NOT_FOUND,
    });
  });
});

describe('Gestionar usuarios', () => {
  it('lista los usuarios sin el hash de la contraseña', async () => {
    const { listUsers, team } = await setupTeam();

    const users = await listUsers.execute(actorOf(team.salesLeader));

    expect(users).toHaveLength(Object.keys(team).length);
    expect(JSON.stringify(users)).not.toContain('stored-password-hash');
  });

  it('un comercial no lista los usuarios', async () => {
    const { listUsers, team } = await setupTeam();

    await expect(listUsers.execute(actorOf(team.salesRep))).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
  });

  it('desactivar a un usuario cierra todas sus sesiones y queda auditado', async () => {
    const { update, team, sessionIssuer, sessionRepository, auditLogger } = await setupTeam();
    const openSession = await sessionIssuer.open(team.salesRep);

    const updatedUser = await update.execute(actorOf(team.salesLeader), team.salesRep.id, { isActive: false });

    expect(updatedUser.isActive).toBe(false);
    expect(sessionRepository.revocationReasonOf(openSession.refreshToken.split('.')[0])).toBe(
      SessionRevocationReason.USER_DEACTIVATED,
    );
    expect(auditLogger.entries).toEqual([
      expect.objectContaining({
        action: AuditAction.USER_UPDATED,
        metadata: expect.objectContaining({ isActive: false }),
      }),
    ]);
  });

  it('el socio cambia el rol de otro socio (D-16)', async () => {
    const { update, team } = await setupTeam();

    await expect(
      update.execute(actorOf(team.partner), team.otherPartner.id, { role: Role.SALES_LEADER }),
    ).resolves.toMatchObject({ role: Role.SALES_LEADER });
  });

  it('el líder comercial no asciende a un comercial a líder (D-17)', async () => {
    const { update, team } = await setupTeam();

    await expect(
      update.execute(actorOf(team.salesLeader), team.salesRep.id, { role: Role.SALES_LEADER }),
    ).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_PERMISSIONS });
  });

  it('nadie gestiona al dueño', async () => {
    const { update, team } = await setupTeam();

    await expect(update.execute(actorOf(team.partner), team.owner.id, { isActive: false })).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
  });

  it('nadie se desactiva ni se cambia el rol a sí mismo', async () => {
    const { update, team } = await setupTeam();

    await expect(update.execute(actorOf(team.partner), team.partner.id, { isActive: false })).rejects.toMatchObject({
      code: ErrorCode.CANNOT_MANAGE_OWN_ACCOUNT,
    });
  });

  it('un usuario que no existe responde USER_NOT_FOUND', async () => {
    const { update, team } = await setupTeam();

    await expect(update.execute(actorOf(team.owner), 'no-existe', { isActive: false })).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
    });
  });
});
