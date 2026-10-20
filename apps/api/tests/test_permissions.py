"""The RBAC matrix is security-critical, so every cell is pinned explicitly here. Changing
a role's permissions must be a deliberate edit to this table (and to ARCHITECTURE.md §7)."""

import pytest
from httpx import AsyncClient

from afterhours.auth.permissions import ROLE_PERMISSIONS, Permission, Role, has_permission
from tests.conftest import LoginAs

P = Permission
EXPECTED: dict[Role, set[Permission]] = {
    Role.ADMIN: set(Permission),
    Role.OPS_MANAGER: {
        P.VIEW_OPERATIONS,
        P.CHANGE_ATTRACTION_STATUS,
        P.CONFIGURE_ATTRACTION,
        P.CREATE_TICKET,
        P.ASSIGN_TICKET,
        P.UPDATE_ANY_TICKET,
        P.UPDATE_OWN_TICKET,
        P.VIEW_AUDIT_LOG,
    },
    Role.TECHNICIAN: {P.VIEW_OPERATIONS, P.CREATE_TICKET, P.UPDATE_OWN_TICKET},
    Role.ANALYST: {P.VIEW_OPERATIONS, P.VIEW_AUDIT_LOG},
}


@pytest.mark.parametrize("role", list(Role))
@pytest.mark.parametrize("permission", list(Permission))
def test_permission_matrix(role: Role, permission: Permission) -> None:
    assert has_permission(role, permission) == (permission in EXPECTED[role])


def test_every_role_is_mapped() -> None:
    assert set(ROLE_PERMISSIONS) == set(Role)


@pytest.mark.parametrize("role", [r.value for r in Role])
async def test_all_roles_can_view_operations(
    client: AsyncClient, login_as: LoginAs, role: str
) -> None:
    resp = await client.get("/api/v1/attractions", headers=await login_as(role))
    assert resp.status_code == 200


async def test_operations_require_authentication(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/attractions")
    assert resp.status_code == 401
