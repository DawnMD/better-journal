import { Swirling } from "@/components/ui/swirling";

export default function Loading() {
  return (
    <div className="container items-center justify-center flex h-full">
      <div>
        <Swirling className="size-20" />
      </div>
    </div>
  );
}
