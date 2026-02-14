export default function AdminPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Admin Panel
      </h1>
      <p className="text-muted-foreground">
        Configure search parameters and system prompts.
      </p>
      <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
        System prompt editors, parameter controls, and taxonomy display will be here.
      </div>
    </div>
  );
}
