# FRIENDLY ADMIN API: endpoints used by public/admin.html. Django's technical /admin is separate.
import json
from django.contrib.auth.models import User
from django.db.models import Count
from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import AuditLog, PermissionRule, RoleDefinition, StockRecord, UserProfile
from .permissions import user_can, role_permission_codes

def admin_required(request, code="users.manage"):
    return request.user.is_authenticated and user_can(request.user, code)

def audit(request, action, module, description):
    AuditLog.objects.create(user=request.user, action=action, module=module, description=description)


def ensure_profile(user):
    # Keep the built-in least-privilege role selectable for older accounts too.
    RoleDefinition.objects.get_or_create(
        name="viewer",
        defaults={"description": "Read-only account with no module permissions", "permissions_json": "[]", "is_system": True},
    )
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile


def sync_role_permissions(role_name, permission_codes):
    """Keep RoleDefinition JSON and PermissionRule rows in sync."""
    codes = list(dict.fromkeys(str(code) for code in permission_codes))
    role, _ = RoleDefinition.objects.get_or_create(name=role_name)
    role.permissions_json = json.dumps(codes)
    role.save(update_fields=["permissions_json"])

    known = {}
    for rule in PermissionRule.objects.all().order_by("id"):
        known.setdefault(rule.code, rule)
    for code in codes:
        source = known.get(code)
        PermissionRule.objects.update_or_create(
            role=role_name,
            code=code,
            defaults={
                "label": source.label if source else code.replace(".", " ").replace("_", " ").title(),
                "module": source.module if source else code.split(".", 1)[0].title(),
                "enabled": True,
            },
        )
    PermissionRule.objects.filter(role=role_name).exclude(code__in=codes).update(enabled=False)
    return role

@api_view(["GET"])
def summary(request):
    if not admin_required(request): return Response({"detail":"Permission denied."}, status=403)
    return Response({
        "users": User.objects.count(),
        "active_users": User.objects.filter(is_active=True).count(),
        "roles": RoleDefinition.objects.count(),
        "stock_rows": StockRecord.objects.count(),
        "audit_events": AuditLog.objects.count(),
    })

@api_view(["GET","POST"])
def users(request):
    if getattr(getattr(request.user, "profile", None), "role", "") != "super-admin":
        return Response({"detail": "Only the Super Admin can manage user accounts."}, status=403)

    if request.method == "GET":
        rows = []
        for user in User.objects.order_by("username"):
            profile = ensure_profile(user)
            rows.append({
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "full_name": profile.full_name,
                "role": profile.role,
                "permissions": ["*"] if profile.role == "super-admin" else sorted(role_permission_codes(profile.role)),
                "is_active": user.is_active,
                "is_staff": user.is_staff,
            })
        return Response(rows)

    data = request.data
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    full_name = str(data.get("full_name", "")).strip()
    role_name = str(data.get("role", "viewer")).strip()

    if not email or not password:
        return Response({"detail": "Email and password are required."}, status=400)
    if len(password) < 8:
        return Response({"detail": "Password must contain at least 8 characters."}, status=400)
    if User.objects.filter(username__iexact=email).exists() or User.objects.filter(email__iexact=email).exists():
        return Response({"detail": "A user with this email already exists."}, status=400)
    if not RoleDefinition.objects.filter(name=role_name).exists():
        return Response({"detail": "Select a role that exists in Roles & Permissions."}, status=400)
    if role_name == "super-admin" and getattr(getattr(request.user, "profile", None), "role", "") != "super-admin":
        return Response({"detail": "Only a Super Admin can assign the Super Admin role."}, status=403)

    with transaction.atomic():
        user = User.objects.create_user(username=email, email=email, password=password)
        user.is_staff = bool(data.get("is_staff", False))
        user.save(update_fields=["is_staff"])
        profile = UserProfile.objects.create(user=user, role=role_name, full_name=full_name)

    audit(request, "user.created", "Administration", f"Created user {email} with role {role_name}")
    return Response({
        "id": user.id, "email": user.email, "username": user.username,
        "full_name": profile.full_name, "role": profile.role,
        "permissions": UserPermissionList(profile.role), "is_active": user.is_active,
    }, status=201)


def UserPermissionList(role_name):
    if role_name == "super-admin":
        return ["*"]
    return sorted(role_permission_codes(role_name))

@api_view(["PATCH", "DELETE"])
def user_detail(request, pk):
    if getattr(getattr(request.user, "profile", None), "role", "") != "super-admin":
        return Response({"detail": "Only the Super Admin can manage user accounts."}, status=403)
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({"detail": "User not found."}, status=404)

    profile = ensure_profile(user)
    actor_role = getattr(getattr(request.user, "profile", None), "role", "")

    if request.method == "DELETE":
        if user == request.user:
            return Response({"detail": "You cannot delete your own account."}, status=400)
        if profile.role == "super-admin" and User.objects.filter(is_active=True, profile__role="super-admin").count() <= 1:
            return Response({"detail": "You cannot delete the last active Super Admin account."}, status=400)
        email = user.email
        user.delete()
        audit(request, "user.deleted", "Administration", f"Permanently deleted user {email}")
        return Response({"ok": True})

    data = request.data
    if "role" in data:
        new_role = str(data.get("role", "")).strip()
        if not RoleDefinition.objects.filter(name=new_role).exists():
            return Response({"detail": "Selected role does not exist."}, status=400)
        if new_role == "super-admin" and actor_role != "super-admin":
            return Response({"detail": "Only a Super Admin can assign the Super Admin role."}, status=403)
        if user == request.user and actor_role == "super-admin" and new_role != "super-admin":
            return Response({"detail": "You cannot remove your own Super Admin role."}, status=400)
        profile.role = new_role

    if "full_name" in data:
        profile.full_name = str(data.get("full_name", "")).strip()
    if "is_active" in data:
        user.is_active = bool(data.get("is_active"))
    if "is_staff" in data:
        user.is_staff = bool(data.get("is_staff"))
    if data.get("password"):
        user.set_password(str(data["password"]))

    with transaction.atomic():
        profile.save()
        user.save()
        # A changed role should require a fresh login on the target account.
        if "role" in data or "password" in data or data.get("is_active") is False:
            user.refresh_tokens.filter(revoked=False).update(revoked=True)

    audit(request, "user.updated", "Administration", f"Updated {user.email}; role={profile.role}")
    return Response({
        "ok": True, "id": user.id, "email": user.email,
        "full_name": profile.full_name, "role": profile.role,
        "permissions": UserPermissionList(profile.role), "is_active": user.is_active,
    })

@api_view(["GET", "POST"])
def roles(request):
    if not admin_required(request, "roles.manage"):
        return Response({"detail": "Permission denied."}, status=403)
    if request.method == "GET":
        RoleDefinition.objects.get_or_create(
            name="viewer",
            defaults={"description": "Read-only account with no module permissions", "permissions_json": "[]", "is_system": True},
        )
        return Response([
            {
                "id": role.id,
                "name": role.name,
                "description": role.description,
                "permissions": json.loads(role.permissions_json or "[]"),
                "is_system": role.is_system,
            }
            for role in RoleDefinition.objects.order_by("name")
        ])

    name = str(request.data.get("name", "")).strip()
    if not name:
        return Response({"detail": "Role name is required."}, status=400)
    if RoleDefinition.objects.filter(name__iexact=name).exists():
        return Response({"detail": "This role already exists."}, status=400)
    if len(name) > 30:
        return Response({"detail": "Role name must be 30 characters or fewer."}, status=400)
    permissions = request.data.get("permissions", [])
    if not isinstance(permissions, list):
        return Response({"detail": "Permissions must be a list."}, status=400)

    role = RoleDefinition.objects.create(
        name=name,
        description=str(request.data.get("description", "")),
        permissions_json="[]",
        is_system=False,
    )
    sync_role_permissions(role.name, permissions)
    audit(request, "role.created", "Administration", f"Created role {name}")
    return Response({"id": role.id, "name": role.name}, status=201)


@api_view(["PATCH"])
def role_detail(request, pk):
    if not admin_required(request, "roles.manage"):
        return Response({"detail": "Permission denied."}, status=403)
    try:
        role = RoleDefinition.objects.get(pk=pk)
    except RoleDefinition.DoesNotExist:
        return Response({"detail": "Role not found."}, status=404)
    if role.name == "super-admin":
        return Response({"detail": "Super Admin permissions cannot be changed."}, status=400)

    permissions = request.data.get("permissions", json.loads(role.permissions_json or "[]"))
    if not isinstance(permissions, list):
        return Response({"detail": "Permissions must be a list."}, status=400)
    role.description = str(request.data.get("description", role.description))
    role.save(update_fields=["description"])
    sync_role_permissions(role.name, permissions)
    audit(request, "role.updated", "Administration", f"Updated role {role.name}")
    return Response({"ok": True})


@api_view(["GET"])
def permissions(request):
    if not admin_required(request, "roles.manage"):
        return Response({"detail": "Permission denied."}, status=403)
    # Admin's seeded rule rows are the canonical catalogue of available actions.
    # Build a stable, deduplicated catalogue from all seeded role rules.
    catalogue = {}
    for rule in PermissionRule.objects.order_by("module", "label", "id"):
        catalogue.setdefault(rule.code, {
            "code": rule.code,
            "label": rule.label,
            "module": rule.module,
        })
    return Response(sorted(catalogue.values(), key=lambda item: (item["module"], item["label"])))

@api_view(["GET"])
def audit_logs(request):
    if not admin_required(request,"audit.view"): return Response({"detail":"Permission denied."},status=403)
    rows=[]
    for x in AuditLog.objects.select_related("user").order_by("-created_at")[:500]:
        rows.append({"id":x.id,"user":x.user.email if x.user else "System","action":x.action,
                     "module":x.module,"description":x.description,"created_at":x.created_at})
    return Response(rows)

@api_view(["GET"])
def stock_rows(request):
    if not admin_required(request,"inventory.view"): return Response({"detail":"Permission denied."},status=403)
    qs=StockRecord.objects.all()
    category=request.GET.get("category")
    q=request.GET.get("q")
    if category: qs=qs.filter(category__icontains=category)
    if q: qs=qs.filter(item_name__icontains=q)
    return Response([{
        "id":x.id,"category":x.category,"item_name":x.item_name,"size":x.size,"color":x.color,
        "thickness":x.thickness,"width":x.width,"length":x.length,"minimum_stock":x.minimum_stock,
        "unit":x.unit,"available_stock":x.available_stock,"required_stock":x.required_stock,
        "source_file":x.source_file,"source_sheet":x.source_sheet,"source_row":x.source_row,"stock_date":x.stock_date,
        "remark":x.remark
    } for x in qs[:2000]])

@api_view(["POST"])
def reimport(request):
    if not admin_required(request,"inventory.import"): return Response({"detail":"Permission denied."},status=403)
    from django.core.management import call_command
    call_command("import_sample_data")
    audit(request,"stock.imported","Inventory","Re-imported all supplied Excel stock sheets.")
    return Response({"ok":True})
