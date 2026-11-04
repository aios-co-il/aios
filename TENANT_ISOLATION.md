# Tenant Isolation - מסמך אבטחה

## סקירה כללית

המערכת מיושמת כ-SaaS multi-tenant עם בידוד מלא בין ארגונים.

## ארכיטקטורה

### 1. Tenant Context

- משתמש יכול להיות חבר בכמה ארגונים (שורה לכל ארגון ב-`tenant_users`), ופועל בכל רגע בארגון פעיל אחד (`user_active_tenant`)
- הגישה לארגון באה משורת `tenant_users` עצמה. חבר שהושבת או נמחק מארגון יוצא מ-`tenant_users` ומ-`user_roles` של הארגון, ונרשם ב-`tenant_inactive_members` (`inactive` או `deleted`). חברי הארגון קוראים את הטבלה ואת השם והסטטוס שלו דרך `tenant_departed_members`, כך שההיסטוריה ממשיכה להציג את שמו, אבל לא את שאר הפרופיל. רק הפונקציות `offboard_tenant_member` ו-`reactivate_tenant_member` (service role) כותבות בה. השבתה, הפעלה מחדש ומחיקה (`set-user-active`, `delete-user`) מותרות רק למי שמדורג מעל המשתמש בכל ארגון שהוא חבר בו: super admin שפועל בארגון מעל כולם חוץ מ-super admin אחר, בעלים של ארגון אב מעל כל המשתמשים בתתי-הארגונים שלו, ובעלים מעל כל המשתמשים בארגון שלו חוץ מבעלים אחר. אף אחד לא פועל על super admin, ואת הבעלים האחרון לא מוציאים. הכלל כתוב פעמיים וחייב להישאר זהה: `actor_may_manage_member` ב-SQL ו-`_shared/user-admin/member-rank.ts` ב-edge (`20261104100000_user_deactivate_keep_history.sql`)
- המערכת משתמשת ב-TenantProvider לניהול הארגון הנוכחי
- Super admins יכולים לצפות בכל הארגונים ולעבור לכל ארגון, אבל כותבים נתונים רק בארגון הפעיל שלהם

### 2. Row Level Security (RLS)

כל טבלה בעלת נתונים משותפת את המבנה הבא:

```sql
tenant_id uuid REFERENCES tenants(id)
```

#### RLS Policies

כל טבלה עם tenant_id חייבת להכיל מדיניות RLS:

```sql
CREATE POLICY "Users can view data in their tenant"
ON table_name
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  OR is_super_admin(auth.uid())
);
```

### 3. פונקציות בסיס נתונים

#### get_user_tenant_id

מחזירה את ה-tenant הפעיל של המשתמש (`user_active_tenant`), ואם אין כזה את החברות הראשונה שלו ב-`tenant_users`.

#### get_effective_tenant_id

אותו כלל עבור המשתמש המחובר (`auth.uid()`).

מעבר tenant: משתמש כותב רק את השורה שלו ב-`user_active_tenant`, ורק ל-tenant שהוא חבר בו (`user_is_tenant_member`); super admin עובר לכל tenant. trigger על הטבלה אוכף את אותו כלל גם בכתיבה של service role, ושורה של super admin שאיבד את התפקיד ואינו חבר ב-tenant שלה נמחקת. שתי הפונקציות סומכות על הכלל הזה ואינן בודקות חברות בעצמן.

#### is_super_admin

בודקת אם המשתמש הוא super admin

### 4. טבלאות עם בידוד Tenant

הטבלאות הבאות **חייבות** להיות מסוננות לפי tenant_id:

- ✅ agencies
- ✅ clients
- ✅ leads
- ✅ campaigners
- ✅ sales_people
- ✅ suppliers
- ✅ tasks
- ✅ client_onboarding
- ✅ finance
- ✅ products
- ✅ automations
- ✅ time_entries
- ✅ import_history
- ✅ workshop_artifacts
- ✅ workshop_assets
- ✅ cursor_task_sessions
- ✅ tenant_inactive_members

### 5. טבלאות גלובליות (ללא tenant_id)

- user_roles - הרשאות משתמש
- tenant_users - חיבור משתמשים לארגונים
- tenants - רשימת ארגונים
- profiles - פרופילים (קישור ל-auth.users)

## כללי אבטחה

### ✅ דברים שחייבים להתקיים:

1. **כל שורה חדשה חייבת לכלול tenant_id**

   ```typescript
   await supabase.from('clients').insert({
     name: 'Client Name',
     tenant_id: userTenantId, // חובה!
     ...
   });
   ```

2. **כל query SELECT חייב לסנן לפי tenant_id** (למעט super admins)

   ```typescript
   const { data } = await supabase
     .from("clients")
     .select("*")
     .eq("tenant_id", currentTenantId); // RLS יוסיף גם סינון
   ```

3. **ארגון חדש מתחיל ריק**
   - אין העתקת נתונים מארגון אחר
   - כל ה-IDs חדשים
   - אין גישה לנתוני ארגונים אחרים

### ❌ דברים אסורים:

1. **לעולם אל תעקוף RLS policies** באמצעות service role key מהצד לקוח
2. **אל תשתמש ב-localStorage לאימות** - רק לשמירת העדפות UI
3. **אל תסמוך על auth.uid() בלבד** - תמיד השתמש גם ב-tenant_id
4. **אל תאפשר queries ללא סינון tenant_id** (למעט טבלאות גלובליות)

## בדיקת אבטחה

### כיצד לוודא בידוד נכון:

1. **הפעל את ה-linter**:

   ```bash
   supabase db lint
   ```

2. **בדוק RLS policies**:

   ```sql
   SELECT schemaname, tablename, policyname
   FROM pg_policies
   WHERE tablename NOT IN ('user_roles', 'tenant_users', 'profiles', 'tenants');
   ```

3. **בדוק שכל הטבלאות עם tenant_id מסוננות**:
   ```sql
   SELECT table_name
   FROM information_schema.columns
   WHERE column_name = 'tenant_id'
   AND table_schema = 'public';
   ```

## יצירת ארגון חדש

כשיוצרים ארגון חדש:

1. נוצר record ב-`tenants` table
2. נוצר invitation token לבעלים
3. הבעלים מתווסף ל-`tenant_users`
4. הארגון החדש ריק לגמרי - אין בו לקוחות, קמפיינרים, וכו'
5. הבעלים יכול להזמין משתמשים נוספים לארגון

## Super Admin

Super admin יכול:

- ✅ לצפות בכל הארגונים
- ✅ ליצור ארגונים חדשים
- ✅ לנהל משתמשים
- ❌ **לא יכול לשנות נתונים בין ארגונים** (RLS מונע): קורא בכל הארגונים, וכותב רק בארגון שהוא פועל בו (`get_user_tenant_id`). כדי לעבוד בארגון אחר הוא עובר אליו.

כלל לפוליסות: ענף `or is_super_admin(...)` מותר רק בקריאה (SELECT). בפוליסת INSERT, UPDATE או DELETE ה-super admin נבדק רק יחד עם הארגון הפעיל, ופוליסת FOR ALL עם ענף כזה מתפצלת ל-`<table>_select` (ארגון או super admin) ול-`<table>_write` (ארגון בלבד).

חריג יחיד: `tenant_templates` ו-`terminology_presets` הם קטלוגים גלובליים שמהם נבנים ארגונים חדשים, ולא נתונים של ארגון אחד, ולכן super admin כותב בהם בכל ארגון (`20261102113700_rls_super_admin_acting_tenant.sql`).

## תחזוקה שוטפת

### כשמוסיפים טבלה חדשה:

1. **הוסף עמודת tenant_id**:

   ```sql
   ALTER TABLE new_table ADD COLUMN tenant_id uuid REFERENCES tenants(id);
   ```

2. **הוסף RLS policies**:

   ```sql
   ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Users can view in their tenant"
   ON new_table FOR SELECT
   USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
   ```

3. **עדכן את המסמך הזה** ✓

## סיכום

המערכת מיושמת עם **בידוד מלא** בין ארגונים:

- כל נתון משויך לארגון ספציפי
- RLS מבטיח שמשתמשים רואים רק את הנתונים של הארגון שלהם
- ארגון חדש מתחיל תמיד ריק
- אין דליפת נתונים בין ארגונים
