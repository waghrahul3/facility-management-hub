import { createContext, useContext } from "react";
import type { ReactNode } from "react";

interface FacilityScopeValue {
  /** The facility id the page should operate on. */
  facilityId: string | null;
  /** URL prefix for links to this facility's sections (e.g. "/facility" or "/company/facility/:id"). */
  base: string;
}

const FacilityScopeContext = createContext<FacilityScopeValue>({
  facilityId: null,
  base: "/facility",
});

/**
 * Supplies the facility a page should operate on.
 *  - FACILITY_ADMIN routes provide the admin's own facility (base "/facility").
 *  - COMPANY_ADMIN workspace routes provide the selected facility (route param,
 *    base "/company/facility/:id").
 */
export function FacilityScopeProvider({
  facilityId,
  base = "/facility",
  children,
}: {
  facilityId: string | null;
  base?: string;
  children: ReactNode;
}) {
  return (
    <FacilityScopeContext.Provider value={{ facilityId, base }}>
      {children}
    </FacilityScopeContext.Provider>
  );
}

export function useFacilityScope(): FacilityScopeValue {
  return useContext(FacilityScopeContext);
}
