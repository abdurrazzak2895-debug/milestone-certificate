import { CandidatePhoto } from "./CandidatePhoto";

export const agentPhotoPath = (id: string) => `candidate-drafts/${id}/agent-profile.jpg`;

export function AgentPhoto({ id, name = "এজেন্ট" }: { id: string; name?: string }) {
  return (
    <div className="flex items-center gap-3">
      <CandidatePhoto path={agentPhotoPath(id)} name={name} size={72} />
      <span className="min-w-0 break-words text-sm text-muted-foreground">
        এজেন্ট{name !== "এজেন্ট" ? `: ${name}` : ""}
      </span>
    </div>
  );
}
