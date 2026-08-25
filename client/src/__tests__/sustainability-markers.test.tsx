import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ImpactMarkers } from "@/pages/restaurant/Catalog";

describe("catalog sustainability markers", () => {
  test("groups literal local, seasonal, lower-waste, and packaging markers with an accessible label", () => {
    render(
      <ImpactMarkers
        lang="de"
        product={{
          id: "product-local",
          localImpact: { isLocal: true, isSeasonal: true, lowWaste: true, packagingKnown: true },
        } as any}
      />,
    );

    const marker = screen.getByTestId("impact-signal-product-local");
    expect(marker).toHaveAccessibleName("Lokal, Saisonal, Wenig Verpackung, Verpackung");
    expect(marker).toHaveTextContent("📍 🌱 ♻️ 📦");
  });

  test("shows Rescue only for an actual Rescue promotion", () => {
    render(
      <ImpactMarkers
        lang="de"
        product={{
          id: "product-rescue",
          localImpact: { isLocal: false, isSeasonal: false, lowWaste: false, packagingKnown: false },
          activePromotion: { promotionType: "rescue" },
        } as any}
      />,
    );

    expect(screen.getByTestId("impact-signal-product-rescue")).toHaveAccessibleName("Rescue-Angebot");
    expect(screen.getByTestId("impact-signal-product-rescue")).toHaveTextContent("⚡");
  });

  test("does not invent a marker when Local Impact is unavailable", () => {
    const { container } = render(
      <ImpactMarkers
        lang="it"
        product={{
          id: "product-unknown",
          localImpact: { isLocal: null, isSeasonal: null, lowWaste: null },
        } as any}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("impact-signal-product-unknown")).not.toBeInTheDocument();
  });
});