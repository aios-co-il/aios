import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "./useCurrentTenant";
import type { LeadCustomFieldDefinition } from "@/lib/leadCustomFields";

type EntityType = 'task' | 'client' | 'lead';

interface FieldConfig {
  label: string;
  isVisible: boolean;
}

export function useCustomFieldLabels(entityType: EntityType) {
  const { tenantId } = useCurrentTenant();

  const { data: fieldData, isLoading } = useQuery({
    queryKey: ['custom-field-labels', tenantId, entityType],
    queryFn: async () => {
      if (!tenantId) return { labels: {}, visibility: {}, definitions: [] };

      const { data, error } = await supabase
        .from('custom_fields')
        .select(
          'id, field_key, field_label, field_type, is_required, is_visible, options, sort_order',
        )
        .eq('tenant_id', tenantId)
        .eq('entity_type', entityType)
        .order('sort_order');

      if (error) throw error;
      
      // Convert to maps for easy lookup
      const labelsMap: Record<string, string> = {};
      const visibilityMap: Record<string, boolean> = {};
      
      data?.forEach(field => {
        labelsMap[field.field_key] = field.field_label;
        visibilityMap[field.field_key] = field.is_visible;
      });
      return {
        labels: labelsMap,
        visibility: visibilityMap,
        definitions: (data || []) as LeadCustomFieldDefinition[],
      };
    },
    enabled: !!tenantId,
  });

  const getFieldLabel = (fieldKey: string, fallback: string = fieldKey) => {
    return fieldData?.labels?.[fieldKey] || fallback;
  };

  const isFieldVisible = (fieldKey: string, defaultVisible: boolean = true) => {
    if (!fieldData?.visibility || !(fieldKey in fieldData.visibility)) {
      return defaultVisible;
    }
    return fieldData.visibility[fieldKey];
  };

  return {
    fieldLabels: fieldData?.labels || {},
    fieldDefinitions: fieldData?.definitions || [],
    getFieldLabel,
    isFieldVisible,
    isLoading,
  };
}
