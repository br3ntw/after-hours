"""Print the OpenAPI document. The committed copy at docs/openapi.json is the API contract
the web app's TypeScript types are generated from; CI fails if it drifts from the code."""

import json
import os

os.environ.setdefault("AH_JWT_SECRET", "openapi-export-only-" + "x" * 32)

from afterhours.main import app  # settings must exist before import


def main() -> None:
    print(json.dumps(app.openapi(), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
