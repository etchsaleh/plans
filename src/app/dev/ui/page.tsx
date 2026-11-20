import type { Metadata } from "next";
import { Gallery } from "./gallery";

export const metadata: Metadata = { title: "UI kit" };

/** Living style guide for the iOS primitives + vendored Spell UI components. */
export default function DevUiPage() {
  return <Gallery />;
}
