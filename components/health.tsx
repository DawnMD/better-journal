"use client";

import { orpc } from "@/lib/orpc.query";
import { useQuery } from "@tanstack/react-query";

export const Health = () => {
  const { data, isLoading } = useQuery(orpc.healthCheck.check.queryOptions());

  if (isLoading && !data) {
    return <div>Loading....</div>;
  }

  return <div>{data}</div>;
};
