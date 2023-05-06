//same effect on the ui as 'update_checkout' event on
//wp-content/plugins/woocommerce/assets/js/frontend/checkout.js
const blockCheckoutForm = () => {
    if (!jQuery.blockUI) {
        return;
    }

    jQuery('.woocommerce-checkout-payment, .woocommerce-checkout-review-order-table').block({
        message: null,
        overlayCSS: {
            background: '#fff',
            opacity: 0.6
        }
    });
}

const unblockCheckoutForm = () => {
    if (!jQuery.blockUI) {
        return;
    }

    jQuery('.woocommerce-checkout-payment, .woocommerce-checkout-review-order-table').unblock();
}

const selectWarehouse = (target) => {

    if (!target) {
        return;
    }

    const warehouses_tab = document.querySelectorAll('.woocommerce-checkout-review-order');
    warehouses_tab.forEach(item => {
        item.classList.remove('active');
    });
    
    const warehouse = target.dataset.warehouse;
    const warehouse_tab = document.querySelector('.warehouse-' + warehouse);
    warehouse_tab.classList.add('active');

    document.querySelectorAll('[data-warehouse]').forEach(item => {
        item.classList.remove('active');
    });
    target.classList.add('active');
}

const changeWarehouse = (event) => {

    blockCheckoutForm();

    //wp-admin/admin.php?page=multi-location-inventory-management
    const slug =
        event.target.dataset && event.target.dataset.slug ?
        event.target.dataset.slug : null;

    if (!slug) {
        return;
    }

    fetch(change_location_backend.ajax_url, {
        method: 'POST',
        body: new URLSearchParams({
            action: 'change_location',
            slug: slug,
            security: change_location_backend.nonce
        })
    })
    .then(response => response.json())
    .then(data => {

        if (data.success) {
            selectWarehouse(event.target);

            //update_checkout will unblock the checkout form
            document.body.dispatchEvent(new Event('update_checkout'));
            return;
        }

        alert(data.data.error ?? 'Something went wrong');
        unblockCheckoutForm();
    })
    .catch((error) => {
        console.error('Error:', error);
        unblockCheckoutForm();
    });
}

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('[data-warehouse]').forEach(item => {
        item.addEventListener('click', event => {
            changeWarehouse(event);
        });
    });
});