from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("erp", "0008_order_email_recipients")]

    operations = [
        migrations.AlterField(
            model_name="product",
            name="minimum_stock",
            field=models.DecimalField(max_digits=14, decimal_places=4, default=0),
        ),
        migrations.AlterField(
            model_name="product",
            name="thickness",
            field=models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True),
        ),
        migrations.AlterField(
            model_name="inventory",
            name="quantity",
            field=models.DecimalField(max_digits=14, decimal_places=4, default=0),
        ),
        migrations.AlterField(
            model_name="stockmovement",
            name="quantity_change",
            field=models.DecimalField(max_digits=14, decimal_places=4),
        ),
        migrations.AlterField(
            model_name="stockmovement",
            name="quantity_after",
            field=models.DecimalField(max_digits=14, decimal_places=4),
        ),
        migrations.AlterField(
            model_name="order",
            name="quantity",
            field=models.DecimalField(max_digits=14, decimal_places=4),
        ),
        migrations.AlterField(
            model_name="productionorder",
            name="quantity",
            field=models.DecimalField(max_digits=14, decimal_places=4),
        ),
        migrations.AlterField(
            model_name="productionorder",
            name="produced_quantity",
            field=models.DecimalField(max_digits=14, decimal_places=4, default=0),
        ),
        migrations.AlterField(
            model_name="bomitem",
            name="quantity_per_unit",
            field=models.DecimalField(max_digits=14, decimal_places=4),
        ),
        migrations.AlterField(
            model_name="inventorybatch",
            name="quantity",
            field=models.DecimalField(max_digits=14, decimal_places=4, default=0),
        ),
        migrations.AlterField(
            model_name="inventorybatch",
            name="remaining_quantity",
            field=models.DecimalField(max_digits=14, decimal_places=4, default=0),
        ),
        migrations.AlterField(
            model_name="warehousetransaction",
            name="quantity",
            field=models.DecimalField(max_digits=14, decimal_places=4),
        ),
        migrations.AlterField(
            model_name="returnrecord",
            name="return_quantity",
            field=models.DecimalField(max_digits=14, decimal_places=4, default=0),
        ),
        migrations.AlterField(
            model_name="returnrecord",
            name="status",
            field=models.CharField(choices=[
                ("requested", "Return Created"),
                ("received", "Return Accepted"),
                ("inspection", "Mark Packed"),
                ("repair", "Dispatched"),
                ("replacement", "Delivered"),
                ("closed", "Return Completed"),
            ], max_length=30, default="requested"),
        ),
    ]
