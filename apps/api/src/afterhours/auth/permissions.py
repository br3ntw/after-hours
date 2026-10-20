"""Role-based access control: the single source of truth for who may do what.

Routers declare the permission they need (``Depends(require(Permission.X))``); roles are
never compared directly outside this module. The matrix is mirrored in ARCHITECTURE.md §7
and exhaustively tested in ``tests/test_permissions.py``.
"""

from enum import StrEnum


class Role(StrEnum):
    ADMIN = "admin"
    OPS_MANAGER = "ops_manager"
    TECHNICIAN = "technician"
    ANALYST = "analyst"


class Permission(StrEnum):
    VIEW_OPERATIONS = "operations:view"
    CHANGE_ATTRACTION_STATUS = "attractions:change_status"
    CONFIGURE_ATTRACTION = "attractions:configure"
    CREATE_TICKET = "tickets:create"
    ASSIGN_TICKET = "tickets:assign"
    UPDATE_ANY_TICKET = "tickets:update_any"
    UPDATE_OWN_TICKET = "tickets:update_own"
    VIEW_AUDIT_LOG = "audit:view"
    MANAGE_USERS = "users:manage"
    CONTROL_SIMULATION = "simulation:control"


_ALL = frozenset(Permission)

ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.ADMIN: _ALL,
    Role.OPS_MANAGER: _ALL - {Permission.MANAGE_USERS, Permission.CONTROL_SIMULATION},
    Role.TECHNICIAN: frozenset(
        {Permission.VIEW_OPERATIONS, Permission.CREATE_TICKET, Permission.UPDATE_OWN_TICKET}
    ),
    Role.ANALYST: frozenset({Permission.VIEW_OPERATIONS, Permission.VIEW_AUDIT_LOG}),
}


def has_permission(role: Role, permission: Permission) -> bool:
    return permission in ROLE_PERMISSIONS[role]
