import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./TenantContext";
import { useQuery } from "@tanstack/react-query";
import {
  AIOS_BRAND,
  applyBrandTheme,
  BRAND_PRESETS,
  type ColorPalette,
} from "@/theme";

export type { ColorPalette };

interface ThemeContextType {
  palette: ColorPalette;
  setPalette: (palette: ColorPalette) => Promise<void>;
  logoUrl: string | null;
  setLogoUrl: (url: string | null) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { currentTenantId } = useTenant();
  const [palette, setPaletteState] = useState<ColorPalette>("default");
  const [logoUrl, setLogoUrlState] = useState<string | null>(null);

  // Load tenant branding settings
  const { data: brandingSettings } = useQuery({
    queryKey: ["tenant-branding", currentTenantId],
    queryFn: async () => {
      if (!currentTenantId) return null;

      const { data, error } = await supabase
        .from("tenant_settings")
        .select("setting_value")
        .eq("tenant_id", currentTenantId)
        .eq("setting_key", "branding")
        .maybeSingle();

      if (error) throw error;

      // IMPORTANT: React Query does not allow `undefined` as resolved data.
      return (data?.setting_value ?? null) as any;
    },
    enabled: !!currentTenantId,
  });

  // Apply branding when loaded
  useEffect(() => {
    if (brandingSettings) {
      const settings = brandingSettings as {
        colorPalette?: ColorPalette;
        logoUrl?: string;
      };
      const colorPalette = settings.colorPalette || "default";
      const logo = settings.logoUrl || null;

      setPaletteState(colorPalette);
      setLogoUrlState(logo);
      applyPalette(colorPalette);
    }
  }, [brandingSettings]);

  const setPalette = async (newPalette: ColorPalette) => {
    if (!currentTenantId) return;

    setPaletteState(newPalette);
    applyPalette(newPalette);

    // Save to tenant_settings
    const currentSettings =
      (brandingSettings as { colorPalette?: ColorPalette; logoUrl?: string }) ||
      {};
    await supabase.from("tenant_settings").upsert(
      {
        tenant_id: currentTenantId,
        setting_key: "branding",
        setting_value: {
          ...currentSettings,
          colorPalette: newPalette,
        },
      },
      {
        onConflict: "tenant_id,setting_key",
      },
    );
  };

  const setLogoUrl = async (url: string | null) => {
    if (!currentTenantId) return;

    setLogoUrlState(url);

    // Save to tenant_settings
    const currentSettings =
      (brandingSettings as { colorPalette?: ColorPalette; logoUrl?: string }) ||
      {};
    await supabase.from("tenant_settings").upsert(
      {
        tenant_id: currentTenantId,
        setting_key: "branding",
        setting_value: {
          ...currentSettings,
          logoUrl: url,
        },
      },
      {
        onConflict: "tenant_id,setting_key",
      },
    );
  };

  /** Saved settings may hold a palette that no longer exists. */
  function applyPalette(paletteKey: ColorPalette) {
    applyBrandTheme(BRAND_PRESETS[paletteKey] ?? AIOS_BRAND);
  }

  useEffect(() => {
    applyPalette(palette);
  }, [palette]);

  return (
    <ThemeContext.Provider value={{ palette, setPalette, logoUrl, setLogoUrl }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};
