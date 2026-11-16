import { describe, expect, it } from 'vitest';
import { Action, type Actor, can, scopeFor } from '@/application/policies/authorizationPolicy.js';
import { Role } from '@/domain/enums/Role.js';

// F1-T04 (H12): la autorización estaba repartida en `if (role === …)` por casos de uso y controllers.
// Estos tests fijan la matriz vigente (sección 6 de CONTEXT.md); cambiarla es una decisión humana.

const ACTOR_USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';

const managementRoles = [Role.OWNER, Role.PARTNER, Role.SALES_LEADER];
const allRoles = [...managementRoles, Role.SALES_REP];

function actorWith(role: Role): Actor {
  return { userId: ACTOR_USER_ID, role };
}

const ownLead = { ownerUserId: ACTOR_USER_ID };
const someoneElsesLead = { ownerUserId: OTHER_USER_ID };
const unassignedLead = { ownerUserId: undefined };

describe('can', () => {
  describe.each(managementRoles)('%s (gestión)', (role) => {
    it.each([Action.LEAD_UPDATE, Action.LEAD_DELETE, Action.LEAD_REASSIGN])(
      'puede %s cualquier lead de su empresa',
      (action) => {
        expect(can(actorWith(role), action, someoneElsesLead)).toBe(true);
        expect(can(actorWith(role), action, unassignedLead)).toBe(true);
      },
    );

    it.each([Action.LEAD_STATUS_CREATE, Action.LEAD_STATUS_UPDATE, Action.LEAD_ASSIGN_TO_OTHERS])(
      'puede %s',
      (action) => {
        expect(can(actorWith(role), action)).toBe(true);
      },
    );
  });

  describe('SALES_REP', () => {
    const salesRep = actorWith(Role.SALES_REP);

    it.each([Action.LEAD_UPDATE, Action.LEAD_DELETE])('puede %s solo los leads asignados a él', (action) => {
      expect(can(salesRep, action, ownLead)).toBe(true);
      expect(can(salesRep, action, someoneElsesLead)).toBe(false);
      expect(can(salesRep, action, unassignedLead)).toBe(false);
    });

    it('un permiso "solo los suyos" sin recurso concreto se deniega', () => {
      expect(can(salesRep, Action.LEAD_UPDATE)).toBe(false);
    });

    it.each([Action.LEAD_REASSIGN, Action.LEAD_ASSIGN_TO_OTHERS, Action.LEAD_STATUS_CREATE, Action.LEAD_STATUS_UPDATE])(
      'no puede %s',
      (action) => {
        expect(can(salesRep, action, ownLead)).toBe(false);
      },
    );
  });

  describe.each(allRoles)('%s (todos los roles)', (role) => {
    it.each([
      Action.LEAD_CREATE,
      Action.LEAD_STATUS_LIST,
      Action.CONTACT_LIST,
      Action.CONTACT_CREATE,
      Action.CONTACT_UPDATE,
      Action.COMPANY_CONTACT_LIST,
      Action.COMPANY_CONTACT_CREATE,
      Action.COMPANY_CONTACT_UPDATE,
    ])('puede %s', (action) => {
      expect(can(actorWith(role), action)).toBe(true);
    });
  });

  it('un rol desconocido no tiene ningún permiso (se deniega por defecto)', () => {
    const unknownRoleActor = { userId: ACTOR_USER_ID, role: 'SUPER_USER' as Role };

    for (const action of Object.values(Action)) {
      expect(can(unknownRoleActor, action, ownLead)).toBe(false);
    }
  });
});

describe('scopeFor', () => {
  it.each(managementRoles)('%s lista todos los leads de su empresa', (role) => {
    expect(scopeFor(actorWith(role), Action.LEAD_LIST)).toEqual({ kind: 'all' });
  });

  it('SALES_REP lista solo los leads asignados a él', () => {
    expect(scopeFor(actorWith(Role.SALES_REP), Action.LEAD_LIST)).toEqual({ kind: 'own', userId: ACTOR_USER_ID });
  });

  it('SALES_REP sin usuario identificado no lista nada, en lugar de ver todos los leads', () => {
    expect(scopeFor({ role: Role.SALES_REP }, Action.LEAD_LIST)).toEqual({ kind: 'none' });
    expect(scopeFor({ role: Role.SALES_REP, userId: '' }, Action.LEAD_LIST)).toEqual({ kind: 'none' });
  });

  it('un rol desconocido no lista nada', () => {
    expect(scopeFor({ userId: ACTOR_USER_ID, role: 'SUPER_USER' as Role }, Action.LEAD_LIST)).toEqual({
      kind: 'none',
    });
  });
});
