import { FlowProvider } from "./flow";

export default function CreateLayout({ children }: LayoutProps<"/create">) {
  return (
    <FlowProvider>
      <div className="shell">{children}</div>
    </FlowProvider>
  );
}
