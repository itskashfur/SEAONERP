# SERIALIZERS: convert Django database objects to JSON and validate incoming JSON.
from rest_framework import serializers
from .models import *
from .permissions import role_permission_codes

class NonNegativeFieldsMixin:
    """Reject negative physical quantities, weights, measurements and costs."""
    non_negative_fields = ()
    positive_fields = ()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        for name in self.non_negative_fields:
            value = attrs.get(name)
            if value is not None and value < 0:
                raise serializers.ValidationError({name: "Negative values are not allowed."})
        for name in self.positive_fields:
            value = attrs.get(name)
            if value is not None and value <= 0:
                raise serializers.ValidationError({name: "Value must be greater than zero."})
        return attrs
class UserSerializer(serializers.Serializer):
    id=serializers.IntegerField(source="pk")
    email=serializers.EmailField()
    username=serializers.CharField()
    role=serializers.SerializerMethodField()
    full_name=serializers.SerializerMethodField()
    permissions=serializers.SerializerMethodField()

    def _profile(self, obj):
        profile = getattr(obj, "profile", None)
        if profile is None:
            profile, _ = UserProfile.objects.get_or_create(user=obj)
        return profile

    def get_role(self, obj):
        return self._profile(obj).role or "viewer"

    def get_full_name(self, obj):
        return self._profile(obj).full_name or obj.get_full_name() or obj.username

    def get_permissions(self, obj):
        role = self._profile(obj).role or "viewer"
        return sorted(role_permission_codes(role)) if role != "super-admin" else ["*"]

class ProductSerializer(NonNegativeFieldsMixin, serializers.ModelSerializer):
    non_negative_fields = ("minimum_stock", "thickness")
    quantity=serializers.SerializerMethodField()
    class Meta: model=Product; fields="__all__"
    def get_quantity(self,o): return getattr(getattr(o,"inventory",None),"quantity",0)
class InventorySerializer(NonNegativeFieldsMixin, serializers.ModelSerializer):
    non_negative_fields = ("quantity", "average_cost")
    product_name=serializers.CharField(source="product.name",read_only=True)
    sku=serializers.CharField(source="product.sku",read_only=True)
    minimum_stock=serializers.DecimalField(source="product.minimum_stock",max_digits=14,decimal_places=2,read_only=True)
    unit=serializers.CharField(source="product.unit",read_only=True)
    location=serializers.CharField(source="product.location",read_only=True)
    class Meta:
        model=Inventory
        fields=["id","product","product_name","sku","quantity","minimum_stock","unit","location","average_cost","updated_at"]
class OrderSerializer(NonNegativeFieldsMixin, serializers.ModelSerializer):
    non_negative_fields = ("quantity",)
    positive_fields = ("quantity",)
    # The UI submits multiple recipient addresses as an array; DRF validates each one.
    vendor_emails = serializers.ListField(
        child=serializers.EmailField(), required=False, allow_empty=True
    )
    product_name=serializers.CharField(source="product.name",read_only=True)
    unit=serializers.CharField(source="product.unit",read_only=True)

    def validate(self, attrs):
        """Normalize multiple recipients and preserve compatibility with vendor_email."""
        attrs = super().validate(attrs)
        recipients = attrs.get("vendor_emails") or []
        legacy_recipient = attrs.get("vendor_email", "").strip()
        if legacy_recipient and legacy_recipient not in recipients:
            recipients.insert(0, legacy_recipient)
        # Remove duplicates without changing the order entered by the user.
        recipients = list(dict.fromkeys(email.strip().lower() for email in recipients if email.strip()))
        attrs["vendor_emails"] = recipients
        attrs["vendor_email"] = recipients[0] if recipients else ""
        return attrs

    class Meta:
        model=Order
        fields="__all__"
        read_only_fields=["order_number","created_at","status"]
class ProductionSerializer(NonNegativeFieldsMixin, serializers.ModelSerializer):
    non_negative_fields = ("quantity", "produced_quantity")
    positive_fields = ("quantity",)
    product_name=serializers.CharField(source="product.name",read_only=True)
    class Meta: model=ProductionOrder; fields="__all__"; read_only_fields=["production_number","started_at","completed_at"]
class BOMSerializer(NonNegativeFieldsMixin, serializers.ModelSerializer):
    non_negative_fields = ("quantity_per_unit",)
    positive_fields = ("quantity_per_unit",)
    product_name=serializers.CharField(source="product.name",read_only=True)
    component_name=serializers.CharField(source="component_product.name",read_only=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        quantity=attrs.get("quantity_per_unit", getattr(self.instance, "quantity_per_unit", None))
        if quantity is None or quantity <= 0:
            raise serializers.ValidationError({"quantity_per_unit":"Quantity per unit must be greater than zero."})
        product=attrs.get("product", getattr(self.instance, "product", None))
        component=attrs.get("component_product", getattr(self.instance, "component_product", None))
        if product and component and product.pk == component.pk:
            raise serializers.ValidationError({"component_product":"A product cannot be its own BOM component."})
        return attrs

    class Meta: model=BOMItem; fields="__all__"


class BatchSerializer(NonNegativeFieldsMixin, serializers.ModelSerializer):
    non_negative_fields = ("quantity", "remaining_quantity", "unit_cost")
    positive_fields = ("quantity",)
    product_name=serializers.CharField(source="product.name",read_only=True)
    sku=serializers.CharField(source="product.sku",read_only=True)
    class Meta:
        model=InventoryBatch
        fields="__all__"

class WarehouseSerializer(NonNegativeFieldsMixin, serializers.ModelSerializer):
    non_negative_fields = ("quantity",)
    positive_fields = ("quantity",)
    product_name=serializers.CharField(source="product.name",read_only=True)
    class Meta:
        model=WarehouseTransaction
        fields="__all__"

class ReturnSerializer(NonNegativeFieldsMixin, serializers.ModelSerializer):
    non_negative_fields = ("return_quantity",)
    positive_fields = ("return_quantity",)
    order_number=serializers.CharField(source="order.order_number",read_only=True)
    customer_name=serializers.CharField(source="order.customer_name",read_only=True)
    product_name=serializers.CharField(source="order.product.name",read_only=True)
    class Meta:
        model=ReturnRecord
        fields="__all__"
        read_only_fields=["created_at","updated_at"]


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "title", "message", "kind", "is_read", "created_at"]

class BrandSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BrandSettings
        fields = ["company_name", "tagline", "logo_text", "logo_color", "logo_style"]
