import uuid

from pydantic import BaseModel, ConfigDict, Field

from afterhours.auth.permissions import Permission, Role


class LoginRequest(BaseModel):
    # Deliberately not EmailStr: a malformed address is just "invalid credentials", and
    # syntax checks would reject reserved demo domains such as .test.
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=256)


class DemoLoginRequest(BaseModel):
    role: Role


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: Role


class MeOut(UserOut):
    permissions: list[Permission]


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105 - OAuth2 token type, not a secret
    expires_in: int
    user: MeOut
