import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackToDashboard, PageHeader } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  User as UserIcon,
  Building2,
  Lock,
  Camera,
  Save,
  Loader2,
  Globe,
  Mail,
  MapPin,
  Briefcase,
  Info,
  CheckCircle2,
  RefreshCw,
  Smartphone,
  Sparkles
} from "lucide-react";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

type MetaProfile = {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profile_picture_url?: string;
  websites?: string[];
  vertical?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  name_status?: string;
};

const VERTICAL_OPTIONS = [
  { value: "OTHER", label: "Otro / General" },
  { value: "AUTO", label: "Automotriz" },
  { value: "BEAUTY", label: "Belleza, Spa y Cuidado Personal" },
  { value: "APPAREL", label: "Ropa y Moda" },
  { value: "EDU", label: "Educación y Cursos" },
  { value: "ENTERTAIN", label: "Entretenimiento" },
  { value: "EVENT_PLAN", label: "Planificación de Eventos" },
  { value: "FINANCE", label: "Finanzas y Banca" },
  { value: "GROCERY", label: "Supermercados y Alimentos" },
  { value: "HEALTH", label: "Salud y Medicina" },
  { value: "HOTEL", label: "Hotelería y Alojamiento" },
  { value: "NONPROFIT", label: "Organización sin fines de lucro" },
  { value: "PROF_SERVICES", label: "Servicios Profesionales" },
  { value: "RETAIL", label: "Comercio Minorista / Tienda" },
  { value: "TRAVEL", label: "Viajes y Turismo" },
  { value: "RESTAURANT", label: "Restaurantes y Gastronomía" },
];

function ProfilePage() {
  const { user, profile, organization, roles } = useAuth();

  // Estados del Perfil de Usuario
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [orgName, setOrgName] = useState(organization?.name || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar || "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingUser, setSavingUser] = useState(false);

  // Estados de Contraseña
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPass, setChangingPass] = useState(false);

  // Estados del Perfil de Meta WhatsApp
  const [metaProfile, setMetaProfile] = useState<MetaProfile>({
    about: "",
    address: "",
    description: "",
    email: "",
    profile_picture_url: "",
    websites: ["", ""],
    vertical: "OTHER",
    display_phone_number: "",
    verified_name: "",
    quality_rating: "",
  });
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newMetaPhotoUrl, setNewMetaPhotoUrl] = useState("");
  const [uploadingMetaPhoto, setUploadingMetaPhoto] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const metaPhotoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setAvatarUrl(profile.avatar || "");
    }
    if (organization) {
      setOrgName(organization.name || "");
      loadMetaProfile(organization.id);
    }
  }, [profile, organization]);

  const loadMetaProfile = async (orgId: string) => {
    setLoadingMeta(true);
    try {
      const res = await fetch(`/api/whatsapp-profile?org_id=${orgId}`);
      const data = await res.json();
      if (data?.ok && data.profile) {
        const p = data.profile;
        setMetaProfile({
          about: p.about || "",
          address: p.address || "",
          description: p.description || "",
          email: p.email || "",
          profile_picture_url: p.profile_picture_url || "",
          websites: [p.websites?.[0] || "", p.websites?.[1] || ""],
          vertical: p.vertical || "OTHER",
          display_phone_number: p.display_phone_number || "",
          verified_name: p.verified_name || "",
          quality_rating: p.quality_rating || "GREEN",
          name_status: p.name_status || "",
        });
        setNewDisplayName(p.verified_name || "");
      }
    } catch (e) {
      console.warn("[meta-profile] load error:", e);
    } finally {
      setLoadingMeta(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !organization) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor selecciona una imagen");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen debe pesar menos de 5MB");
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${organization.id}/avatar_${user.id}_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from("crm-media").upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (error) throw error;
      const { data: pubUrl } = supabase.storage.from("crm-media").getPublicUrl(data.path);
      setAvatarUrl(pubUrl.publicUrl);
      toast.success("Foto de perfil cargada");
    } catch (e: any) {
      toast.error("Error al subir imagen: " + (e?.message || ""));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleMetaPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organization) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor selecciona una imagen válida para WhatsApp");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen de WhatsApp debe pesar menos de 5MB");
      return;
    }

    setUploadingMetaPhoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${organization.id}/wa_profile_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from("crm-media").upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (error) throw error;
      const { data: pubUrl } = supabase.storage.from("crm-media").getPublicUrl(data.path);
      setNewMetaPhotoUrl(pubUrl.publicUrl);
      toast.success("Foto seleccionada. Haz clic en 'Sincronizar con Meta WhatsApp' para aplicar el cambio.");
    } catch (e: any) {
      toast.error("Error al preparar la foto: " + (e?.message || ""));
    } finally {
      setUploadingMetaPhoto(false);
    }
  };

  const saveUserProfile = async () => {
    if (!user) return;
    setSavingUser(true);
    try {
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim(), avatar: avatarUrl })
        .eq("user_id", user.id);
      if (pErr) throw pErr;

      if (organization && orgName.trim()) {
        await supabase
          .from("organizations")
          .update({ name: orgName.trim() })
          .eq("id", organization.id);
      }

      toast.success("✓ Perfil de usuario actualizado correctamente");
    } catch (e: any) {
      toast.error("Error al guardar: " + (e?.message || ""));
    } finally {
      setSavingUser(false);
    }
  };

  const updatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setChangingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("✓ Contraseña actualizada exitosamente");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      toast.error("Error al cambiar contraseña: " + (e?.message || ""));
    } finally {
      setChangingPass(false);
    }
  };

  const saveMetaProfile = async () => {
    if (!organization) return;
    setSavingMeta(true);
    try {
      const payload: Record<string, any> = {
        org_id: organization.id,
        about: metaProfile.about,
        description: metaProfile.description,
        address: metaProfile.address,
        email: metaProfile.email,
        vertical: metaProfile.vertical,
        websites: metaProfile.websites?.filter(Boolean),
      };

      if (newMetaPhotoUrl) {
        payload.photo_url = newMetaPhotoUrl;
      }
      if (newDisplayName && newDisplayName.trim() !== metaProfile.verified_name) {
        payload.new_display_name = newDisplayName.trim();
      }

      const res = await fetch("/api/whatsapp-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || "Error al actualizar perfil de WhatsApp en Meta");
      }

      toast.success("✓ Perfil oficial de WhatsApp sincronizado y actualizado con Meta");
      setNewMetaPhotoUrl("");
      loadMetaProfile(organization.id);
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar en Meta");
    } finally {
      setSavingMeta(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <BackToDashboard />
      <PageHeader
        title="Mi Perfil & Configuración"
        subtitle="Administra tu cuenta de acceso y la información oficial de tu número de WhatsApp Business"
      />

      <Tabs defaultValue="user" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="user" className="gap-2">
            <UserIcon className="w-4 h-4" />
            Perfil de Usuario
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2">
            <Briefcase className="w-4 h-4" />
            Perfil de WhatsApp (Meta)
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: PERFIL DE USUARIO */}
        <TabsContent value="user" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card border border-border/40 rounded-xl p-6 flex flex-col items-center text-center space-y-4 shadow-sm">
              <div className="relative group">
                <div className="w-28 h-28 rounded-full border-2 border-primary/40 overflow-hidden bg-muted flex items-center justify-center shadow-inner">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-12 h-12 text-muted-foreground" />
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAvatarUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute bottom-0 right-0 p-2 bg-primary text-primary-foreground rounded-full shadow-lg hover:opacity-90 transition-opacity"
                  title="Cambiar foto"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                </button>
              </div>

              <div>
                <h3 className="font-semibold text-lg">{fullName || "Usuario"}</h3>
                <p className="text-sm text-muted-foreground font-mono">{user?.email}</p>
                <div className="flex justify-center gap-2 mt-2 flex-wrap">
                  {roles.map((r) => (
                    <Badge key={r} variant="secondary" className="capitalize text-xs">
                      {r}
                    </Badge>
                  ))}
                  {organization?.plan_type && (
                    <Badge variant="outline" className="text-xs uppercase font-mono">
                      Plan {organization.plan_type}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="md:col-span-2 bg-card border border-border/40 rounded-xl p-6 space-y-6 shadow-sm">
              <h3 className="text-base font-semibold border-b border-border/30 pb-3 flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-primary" />
                Información Personal & Organización
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nombre Completo</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Tu nombre y apellido"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Correo Electrónico (Acceso)</Label>
                  <Input value={user?.email || ""} disabled className="bg-muted/50 cursor-not-allowed" />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Nombre de la Empresa / Organización</Label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                    <Input
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Nombre de tu negocio o agencia"
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={saveUserProfile} disabled={savingUser}>
                  {savingUser ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Guardar Cambios
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border/40 rounded-xl p-6 space-y-4 shadow-sm">
            <h3 className="text-base font-semibold border-b border-border/30 pb-3 flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              Seguridad & Contraseña
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <div className="space-y-1.5">
                <Label>Nueva Contraseña</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Confirmar Nueva Contraseña</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite la nueva contraseña"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                onClick={updatePassword}
                disabled={changingPass || !newPassword}
              >
                {changingPass ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                Actualizar Contraseña
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: PERFIL DE WHATSAPP BUSINESS EN META */}
        <TabsContent value="whatsapp" className="space-y-6">
          <div className="bg-card border border-border/40 rounded-xl p-6 space-y-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-border/30 pb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-emerald-500" />
                  Perfil Oficial de WhatsApp Business
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cambia la foto, nombre visible y descripción de tu número en WhatsApp vía Meta Graph API.
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => organization && loadMetaProfile(organization.id)}
                disabled={loadingMeta}
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loadingMeta ? "animate-spin" : ""}`} />
                Recargar de Meta
              </Button>
            </div>

            {loadingMeta ? (
              <div className="space-y-4 py-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* 1. SECCIÓN DE FOTO DE WHATSAPP */}
                <div className="p-4 bg-muted/20 border border-border/40 rounded-xl flex flex-col sm:flex-row items-center gap-5">
                  <div className="relative group shrink-0">
                    <div className="w-24 h-24 rounded-full border-2 border-emerald-500/40 overflow-hidden bg-background flex items-center justify-center shadow-md">
                      {newMetaPhotoUrl || metaProfile.profile_picture_url ? (
                        <img
                          src={newMetaPhotoUrl || metaProfile.profile_picture_url}
                          alt="WhatsApp Profile"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Smartphone className="w-10 h-10 text-muted-foreground" />
                      )}
                    </div>
                    <input
                      type="file"
                      ref={metaPhotoInputRef}
                      onChange={handleMetaPhotoSelect}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => metaPhotoInputRef.current?.click()}
                      disabled={uploadingMetaPhoto}
                      className="absolute bottom-0 right-0 p-2 bg-emerald-600 text-white rounded-full shadow-lg hover:bg-emerald-700 transition-colors"
                      title="Cambiar foto de WhatsApp"
                    >
                      {uploadingMetaPhoto ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <div className="space-y-1 text-center sm:text-left">
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <h4 className="font-semibold text-base">Foto de Perfil de WhatsApp</h4>
                      {newMetaPhotoUrl ? (
                        <Badge className="bg-amber-500 text-white text-[10px]">Nueva foto lista</Badge>
                      ) : (
                        <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 text-[10px]">
                          Sincronizada con Meta
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Haz clic en el icono de la cámara para subir una nueva foto. Se actualizará en el WhatsApp de tus clientes.
                    </p>
                  </div>
                </div>

                {/* 2. DATOS COMERCIALES */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Nombre para mostrar de WhatsApp */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                        Nombre Visible en WhatsApp (Display Name)
                      </span>
                      {metaProfile.quality_rating && (
                        <Badge variant="outline" className="text-[10px] text-emerald-500">
                          Salud: {metaProfile.quality_rating}
                        </Badge>
                      )}
                    </Label>
                    <Input
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="Ej: LeadFlow, Mi Tienda Oficial..."
                      className="font-medium"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Este es el nombre con el que tus clientes te verán en WhatsApp.
                    </p>
                  </div>

                  {/* Info / Estado ("About") */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-muted-foreground" />
                        Info / Estado ("About")
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {metaProfile.about?.length || 0} / 139
                      </span>
                    </Label>
                    <Input
                      value={metaProfile.about || ""}
                      maxLength={139}
                      onChange={(e) => setMetaProfile({ ...metaProfile, about: e.target.value })}
                      placeholder="Ej: ¡Hola! Estamos disponibles para ayudarte hoy."
                    />
                  </div>

                  {/* Descripción Comercial */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="flex items-center justify-between">
                      <span>Descripción Comercial del Negocio</span>
                      <span className="text-xs text-muted-foreground">
                        {metaProfile.description?.length || 0} / 512
                      </span>
                    </Label>
                    <Textarea
                      rows={3}
                      value={metaProfile.description || ""}
                      maxLength={512}
                      onChange={(e) => setMetaProfile({ ...metaProfile, description: e.target.value })}
                      placeholder="Describe los productos, servicios o propuesta de valor de tu empresa..."
                      className="resize-none"
                    />
                  </div>

                  {/* Categoría */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                      Categoría del Negocio
                    </Label>
                    <select
                      value={metaProfile.vertical || "OTHER"}
                      onChange={(e) => setMetaProfile({ ...metaProfile, vertical: e.target.value })}
                      className="w-full h-10 px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {VERTICAL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      Email Comercial
                    </Label>
                    <Input
                      type="email"
                      value={metaProfile.email || ""}
                      onChange={(e) => setMetaProfile({ ...metaProfile, email: e.target.value })}
                      placeholder="contacto@tuempresa.com"
                    />
                  </div>

                  {/* Website 1 */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                      Sitio Web 1
                    </Label>
                    <Input
                      value={metaProfile.websites?.[0] || ""}
                      onChange={(e) => {
                        const w = [...(metaProfile.websites || ["", ""])];
                        w[0] = e.target.value;
                        setMetaProfile({ ...metaProfile, websites: w });
                      }}
                      placeholder="https://tuempresa.com"
                    />
                  </div>

                  {/* Website 2 */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                      Sitio Web 2 (Opcional)
                    </Label>
                    <Input
                      value={metaProfile.websites?.[1] || ""}
                      onChange={(e) => {
                        const w = [...(metaProfile.websites || ["", ""])];
                        w[1] = e.target.value;
                        setMetaProfile({ ...metaProfile, websites: w });
                      }}
                      placeholder="https://instagram.com/tuempresa"
                    />
                  </div>

                  {/* Dirección */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                      Dirección Física
                    </Label>
                    <Input
                      value={metaProfile.address || ""}
                      maxLength={256}
                      onChange={(e) => setMetaProfile({ ...metaProfile, address: e.target.value })}
                      placeholder="Ej: Calle Principal #123, Tegucigalpa, Honduras"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-3 border-t border-border/30">
                  <Button onClick={saveMetaProfile} disabled={savingMeta} className="bg-emerald-600 hover:bg-emerald-700">
                    {savingMeta ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Sincronizar con Meta WhatsApp
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
