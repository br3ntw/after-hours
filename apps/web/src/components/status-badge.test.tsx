import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { STATUS_META, StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it.each(Object.entries(STATUS_META))("renders a text label for %s (not color alone)", (status, meta) => {
    render(<StatusBadge status={status as keyof typeof STATUS_META} />);
    expect(screen.getByText(meta.label)).toBeInTheDocument();
  });
});
