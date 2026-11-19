import json
from rest_framework.permissions import BasePermission
from .models import PermissionRule, RoleDefinition

PERMISSION_ALIASES = {
    # Product names are read by several modules as supporting lookup data.
    # A user allowed to view a module must be able to read its product list;
    # otherwise the module page itself fails while loading its selectors.
    "products.read": (
        "inventory.view",
        "orders.view",
        "production.view",
        "bom.read",
        "warehouse.receive",
        "warehouse.pick",
        "warehouse.pack",
        "warehouse.dispatch",
    ),
    # Viewsets use a single write gate; roles are configured with the more
    # specific actions shown in the Admin panel.
    "inventory.write": ("inventory.adjust", "inventory.import"),
    "orders.write": ("orders.create", "orders.approve", "orders.dispatch"),
    "production.write": ("production.start", "production.complete"),
}

def role_permission_codes(role):
    if role == "super-admin":
        return {"*"}
    definition = RoleDefinition.objects.filter(name=role).first()
    if definition:
        try:
            configured = json.loads(definition.permissions_json or "[]")
            if isinstance(configured, list):
                return set(str(code) for code in configured)
        except (TypeError, ValueError):
            pass
    return set(PermissionRule.objects.filter(role=role, enabled=True).values_list("code", flat=True))


def user_can(user, code):
    if not user or not user.is_authenticated:
        return False
    role = getattr(getattr(user, "profile", None), "role", "viewer")
    if role == "super-admin":
        return True
    allowed = role_permission_codes(role)
    if "*" in allowed:
        return True
    codes = (code,) + PERMISSION_ALIASES.get(code, ())
    return any(candidate in allowed for candidate in codes)

class RolePermission(BasePermission):
    def has_permission(self, request, view):
        required = getattr(view, "required_permission", None)
        return bool(request.user and request.user.is_authenticated and
                    (not required or user_can(request.user, required)))
