"""Seed Lanternfall Park, a fully fictional park, plus one demo account per role.

Idempotent: re-running updates existing rows by slug/email instead of duplicating them.
Run with ``uv run afterhours-seed``. Refuses to run when ``AH_ENV=prod``.
"""

import asyncio
import sys
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from afterhours.attractions.models import (
    Attraction,
    AttractionStatus,
    AttractionType,
    Land,
    StatusHistory,
)
from afterhours.auth.models import User
from afterhours.auth.permissions import Role
from afterhours.auth.security import hash_password
from afterhours.core.config import get_settings
from afterhours.core.db import get_engine, get_sessionmaker

LANDS: list[dict[str, Any]] = [
    {
        "slug": "tidewater-quay",
        "name": "Tidewater Quay",
        "description": "A lantern-lit harbor of salt, rope, and lighthouse beams.",
    },
    {
        "slug": "clockwork-canyon",
        "name": "Clockwork Canyon",
        "description": "A brass-and-sandstone frontier town that runs on gears and steam.",
    },
    {
        "slug": "aurora-heights",
        "name": "Aurora Heights",
        "description": "Polar ridgelines beneath a permanent shimmer of northern lights.",
    },
    {
        "slug": "emberwood",
        "name": "Emberwood",
        "description": "An enchanted forest held forever at dusk, alive with fireflies.",
    },
    {
        "slug": "starlight-pier",
        "name": "Starlight Pier",
        "description": "A retro-future boardwalk where the space age never ended.",
    },
]

T = AttractionType
# (slug, name, land, type, hourly_capacity, riders_per_dispatch, dispatch_interval_s,
#  popularity, map_x, map_y, description)
ATTRACTIONS: list[tuple[str, str, str, AttractionType, int, int, int, float, float, float, str]] = [
    (
        "undertow-expedition",
        "Undertow Expedition",
        "tidewater-quay",
        T.DARK_RIDE,
        1800,
        12,
        24,
        0.92,
        14,
        62,
        "A submersible voyage through a sunken lantern city.",
    ),
    (
        "lighthouse-leap",
        "Lighthouse Leap",
        "tidewater-quay",
        T.FLAT,
        720,
        16,
        80,
        0.55,
        22,
        74,
        "A drop tower that launches riders up the old beacon.",
    ),
    (
        "gullwing-carousel",
        "Gullwing Carousel",
        "tidewater-quay",
        T.FAMILY,
        900,
        40,
        160,
        0.35,
        9,
        78,
        "Hand-carved seabirds circle a brass music box.",
    ),
    (
        "riptide-rapids",
        "Riptide Rapids",
        "tidewater-quay",
        T.WATER,
        1500,
        10,
        24,
        0.78,
        26,
        55,
        "Round rafts spin through a storm-tossed harbor channel.",
    ),
    (
        "captains-crossing",
        "Captain's Crossing",
        "tidewater-quay",
        T.SHOW,
        2400,
        600,
        900,
        0.40,
        18,
        48,
        "A live harbor-master revue on the quay stage.",
    ),
    (
        "gearspring-runaway",
        "Gearspring Runaway",
        "clockwork-canyon",
        T.COASTER,
        1600,
        24,
        54,
        0.97,
        38,
        22,
        "A runaway ore train through collapsing clockwork mines.",
    ),
    (
        "brass-comet",
        "Brass Comet",
        "clockwork-canyon",
        T.COASTER,
        1200,
        20,
        60,
        0.84,
        46,
        14,
        "A launched coaster fired from a steam cannon.",
    ),
    (
        "tinkers-teacups",
        "Tinker's Teacups",
        "clockwork-canyon",
        T.FAMILY,
        840,
        35,
        150,
        0.38,
        30,
        30,
        "Spinning cogs-and-saucers in the inventor's workshop.",
    ),
    (
        "canyon-cable-cars",
        "Canyon Cable Cars",
        "clockwork-canyon",
        T.FLAT,
        600,
        4,
        24,
        0.45,
        52,
        28,
        "A slow glide over the canyon's steam vents.",
    ),
    (
        "pendulum-plunge",
        "Pendulum Plunge",
        "clockwork-canyon",
        T.FLAT,
        960,
        32,
        120,
        0.66,
        42,
        34,
        "A giant swinging pendulum over the canyon floor.",
    ),
    (
        "borealis-drift",
        "Borealis Drift",
        "aurora-heights",
        T.DARK_RIDE,
        1440,
        8,
        20,
        0.88,
        64,
        12,
        "A trackless sled ride through the northern lights.",
    ),
    (
        "skyward-gondolas",
        "Skyward Gondolas",
        "aurora-heights",
        T.FLAT,
        800,
        6,
        27,
        0.50,
        72,
        20,
        "Glass gondolas climbing to the park's highest ridge.",
    ),
    (
        "glacier-run",
        "Glacier Run",
        "aurora-heights",
        T.COASTER,
        1280,
        16,
        45,
        0.90,
        80,
        10,
        "A bobsled coaster down a crackling ice shelf.",
    ),
    (
        "polar-parade-hall",
        "Polar Parade Hall",
        "aurora-heights",
        T.SHOW,
        1800,
        450,
        900,
        0.42,
        70,
        30,
        "A puppet spectacle of migrating aurora spirits.",
    ),
    (
        "fireflight-hollow",
        "Fireflight Hollow",
        "emberwood",
        T.DARK_RIDE,
        1440,
        6,
        15,
        0.86,
        74,
        52,
        "Ride a firefly's lantern through the dusk canopy.",
    ),
    (
        "rootbound-rapids",
        "Rootbound Rapids",
        "emberwood",
        T.WATER,
        1728,
        12,
        25,
        0.80,
        86,
        60,
        "A log flume twisting through ancient root tunnels.",
    ),
    (
        "mosslight-maze",
        "Mosslight Maze",
        "emberwood",
        T.FAMILY,
        500,
        10,
        72,
        0.30,
        80,
        44,
        "A glowing walk-through hedge maze.",
    ),
    (
        "owlwatch-tower",
        "Owlwatch Tower",
        "emberwood",
        T.FLAT,
        640,
        24,
        135,
        0.48,
        90,
        48,
        "A rotating observation drum above the treetops.",
    ),
    (
        "hearthsong-theater",
        "Hearthsong Theater",
        "emberwood",
        T.SHOW,
        1500,
        375,
        900,
        0.44,
        68,
        64,
        "Campfire legends told with shadow puppetry.",
    ),
    (
        "nebula-spinner",
        "Nebula Spinner",
        "starlight-pier",
        T.FLAT,
        1000,
        30,
        108,
        0.62,
        48,
        80,
        "Rocket cars orbiting a glowing central star.",
    ),
    (
        "orbit-9",
        "Orbit 9",
        "starlight-pier",
        T.COASTER,
        1400,
        28,
        72,
        0.93,
        58,
        88,
        "A boardwalk wooden coaster dressed as a 1960s space mission.",
    ),
    (
        "comet-bumpers",
        "Comet Bumpers",
        "starlight-pier",
        T.FAMILY,
        720,
        24,
        120,
        0.46,
        40,
        90,
        "Hover-style bumper cars on a starfield floor.",
    ),
    (
        "satellite-swing",
        "Satellite Swing",
        "starlight-pier",
        T.FLAT,
        960,
        48,
        180,
        0.52,
        64,
        76,
        "A wave swinger around a radar dish.",
    ),
    (
        "moonbeam-arcade-theater",
        "Moonbeam Arcade Theater",
        "starlight-pier",
        T.SHOW,
        1200,
        200,
        600,
        0.36,
        50,
        70,
        "An interactive 4-D shooting gallery.",
    ),
]

DEMO_USERS: list[tuple[str, str, Role]] = [
    ("admin@afterhours.test", "Avery Admin", Role.ADMIN),
    ("ops@afterhours.test", "Morgan Ops", Role.OPS_MANAGER),
    ("tech@afterhours.test", "Riley Technician", Role.TECHNICIAN),
    ("tech2@afterhours.test", "Sam Okafor", Role.TECHNICIAN),
    ("tech3@afterhours.test", "Priya Natarajan", Role.TECHNICIAN),
    ("analyst@afterhours.test", "Jordan Analyst", Role.ANALYST),
]


async def seed(db: AsyncSession, seed_password: str) -> None:
    now = datetime.now(UTC)

    lands: dict[str, Land] = {}
    for order, data in enumerate(LANDS):
        land = await db.scalar(select(Land).where(Land.slug == data["slug"]))
        if land is None:
            land = Land(**data, sort_order=order)
            db.add(land)
        else:
            land.name, land.description, land.sort_order = data["name"], data["description"], order
        lands[data["slug"]] = land
    await db.flush()

    for slug, name, land_slug, type_, cap, rpd, interval, pop, x, y, desc in ATTRACTIONS:
        fields = {
            "name": name,
            "land_id": lands[land_slug].id,
            "type": type_,
            "description": desc,
            "hourly_capacity": cap,
            "riders_per_dispatch": rpd,
            "dispatch_interval_s": interval,
            "popularity": pop,
            "map_x": x,
            "map_y": y,
        }
        attraction = await db.scalar(select(Attraction).where(Attraction.slug == slug))
        if attraction is None:
            attraction = Attraction(slug=slug, status=AttractionStatus.OPERATING, **fields)
            db.add(attraction)
            await db.flush()
            db.add(
                StatusHistory(
                    attraction_id=attraction.id,
                    status=attraction.status,
                    started_at=now,
                    reason="Initial seed",
                )
            )
        else:
            for key, value in fields.items():
                setattr(attraction, key, value)

    password_hash = hash_password(seed_password)
    for email, full_name, role in DEMO_USERS:
        user = await db.scalar(select(User).where(User.email == email))
        if user is None:
            db.add(User(email=email, full_name=full_name, role=role, password_hash=password_hash))
        else:
            user.full_name, user.role, user.password_hash = full_name, role, password_hash

    await db.commit()


async def _main() -> None:
    settings = get_settings()
    if settings.env == "prod":
        sys.exit("Refusing to seed demo accounts when AH_ENV=prod.")
    seed_password = settings.seed_password.get_secret_value() if settings.seed_password else None
    if not seed_password:
        sys.exit("Set AH_SEED_PASSWORD (see .env.example).")
    async with get_sessionmaker()() as db:
        await seed(db, seed_password)
    await get_engine().dispose()
    print(f"Seeded {len(LANDS)} lands, {len(ATTRACTIONS)} attractions, {len(DEMO_USERS)} users.")


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
