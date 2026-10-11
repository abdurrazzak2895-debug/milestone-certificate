import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CandidatePhoto } from "@/components/app/CandidatePhoto";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/photo.jpg" } }) }) } } }));
afterEach(cleanup);
const mount = (path: string | null) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CandidatePhoto path={path} name="TEST CANDIDATE" size={36} /></QueryClientProvider>);
describe("Candidate photos", () => {
  it("keeps initials at the enlarged minimum size without a photo", () => {
    mount(null);
    expect(screen.getByText("TC").parentElement).toHaveStyle({ width: "64px", height: "64px" });
  });
  it("opens a large photo with keyboard activation", async () => {
    mount("candidate-drafts/id/agent-profile.jpg");
    const trigger = await screen.findByRole("button", { name: "TEST CANDIDATE" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getAllByAltText("TEST CANDIDATE")).toHaveLength(2);
  });
});