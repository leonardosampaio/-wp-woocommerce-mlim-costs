<?php

/**
 * Plugin Name: Woocommerce MLIM costs
 * Plugin URI: https://leonardosampaio.dev
 * Description: Calculate shipping and tax costs based on the location selected by the customer
 * Author: Leonardo Sampaio
 * Version: 1.22042023
 */

if (!class_exists('WoocommerceMLIMCosts')) {
    class WoocommerceMLIMCosts
    {
        private static $instance = null;

        public static function getInstance()
        {
            if (null === self::$instance) {
                self::$instance = new self();
            }
            return self::$instance;
        }

        private function __construct()
        {
            add_action('plugins_loaded', array($this, 'init'));
        }

        public function init()
        {
            if (!class_exists('WooCommerce')) {
                add_action('admin_notices', array($this, 'noWooAdminNotice'));
                return;
            }

            add_action('wp_enqueue_scripts', array($this, 'enqueueScripts'));
            add_action('admin_enqueue_scripts', array($this, 'enqueueAdminScripts'));

            add_action('wp_ajax_change_location', array($this, 'changeLocation'));
            add_action('wp_ajax_nopriv_change_location', array($this, 'changeLocation'));

            add_action('wp_ajax_save_taxes_locations', array($this, 'saveTaxesLocations'));
            add_action('wp_ajax_get_taxes_locations', array($this, 'getTaxesLocations'));

            register_setting('WoocommerceMLIMCosts', 'taxes_locations');

            add_filter('woocommerce_find_rates', array($this, 'filterTaxRatesByLocation'), 10, 2);
        }

        /**
         * Only taxes with the same location as the items in cart or no location are valid.
         */
        public function filterTaxRatesByLocation($matched_tax_rates, $args)
        {
            //get_base_tax_rates should always return all taxes
            if ($args['country']    == WC()->countries->get_base_country() &&
                $args['state']      == WC()->countries->get_base_state() &&
                $args['postcode']   == WC()->countries->get_base_postcode() &&
                $args['city']       == WC()->countries->get_base_city()) {
                return $matched_tax_rates;
            }
            
            $locationId = null;
            foreach (WC()->cart->cart_contents as $item) {
                if ($item['select_location'] && $item['select_location']['location_termId']) {
                    //only one location per cart
                    $locationId = $item['select_location']['location_termId'];
                    break;
                }
            }

            if (!$locationId) {
                return $matched_tax_rates;
            }

            $validTaxes = [];
            $locationsMap = get_option('taxes_locations', []);
            foreach ($matched_tax_rates as $taxId => $taxObject) {
                $matches = array_filter($locationsMap, function ($taxLocation) use ($taxId, $locationId) {
                    return $taxLocation['tax_id'] == $taxId &&
                        (empty($taxLocation['location_id']) || $locationId == $taxLocation['location_id']);
                });

                if (!empty($matches)) {
                    $validTaxes[$taxId] = $taxObject;
                }
            }

            return $validTaxes;
        }

        public function noWooAdminNotice()
        {
        ?>
            <div class="notice notice-error is-dismissible">
                <p><?php
                _e(
                    'Woocommerce MLIM costs requires WooCommerce to be installed and activated.',
                    'ajax-change-location'
                );
                ?></p>
            </div>
        <?php
        }

        public function enqueueScripts()
        {
            if (!is_checkout()) {
                return;
            }

            wp_enqueue_script(
                'change-location',
                plugin_dir_url(__FILE__) . 'js/change-location.js',
                array('jquery'),
                '1.0.0',
                true
            );
            wp_localize_script(
                'change-location',
                'change_location_backend',
                array(
                    'ajax_url' => admin_url('admin-ajax.php'),
                    'nonce' => wp_create_nonce('change_location')
                )
            );
        }

        public function enqueueAdminScripts()
        {
            if (
                isset($_GET['page']) &&
                $_GET['page'] == 'wc-settings' &&
                isset($_GET['tab']) &&
                $_GET['tab'] == 'tax'
            ) {

                wp_enqueue_script(
                    'taxes-per-location',
                    plugin_dir_url(__FILE__) . 'js/taxes-per-location.js',
                    array('jquery'),
                    '1.0.0',
                    true
                );
                wp_localize_script(
                    'taxes-per-location',
                    'taxes_per_location_backend',
                    array(
                        'ajax_url' => admin_url('admin-ajax.php'),
                        'nonce' => wp_create_nonce('taxes_per_location'),
                        'locations' => $this->getWarehouseLocations()
                    )
                );
            }
        }

        public function getTaxesLocations()
        {
            check_ajax_referer("taxes_per_location", "security");
            $data = get_option('taxes_locations', []);
            wp_send_json_success($data);
        }

        public function saveTaxesLocations()
        {
            check_ajax_referer("taxes_per_location", "security");

            try {
                $data = json_decode(stripslashes($_POST['taxesLocations']), true, 512, JSON_THROW_ON_ERROR);
                update_option('taxes_locations', $data);
            } catch (\Exception $e) {
                wp_send_json_error(array(
                    'error' => 'Error: invalid json data'
                ));
                return;
            }

            wp_send_json_success();
        }

        private function getWarehouseLocations()
        {
            if (!empty($isLocEx = get_option("wcmlim_exclude_locations_from_frontend"))) {
                return get_terms(
                    array('taxonomy' => 'locations', 'hide_empty' => false, 'parent' => 0, 'exclude' => $isLocEx)
                );
            }

            return get_terms(
                array('taxonomy' => 'locations', 'hide_empty' => false, 'parent' => 0)
            );
        }

        public function changeLocation()
        {
            check_ajax_referer("change_location", "security");

            $term = get_term_by('slug', $_POST['slug'], 'locations');

            if (!$term) {
                wp_send_json_error(array(
                    'error' => 'Error: invalid location slug "' . $_POST['slug'] . '"'
                ));
                return;
            }

            //verify all stocks before updating any cart info
            foreach (WC()->cart->get_cart() as $item) {
                if (0 === ((int) (get_post_meta($item['product_id'], 'wcmlim_stock_at_' . $term->term_id, true)))) {
                    wp_send_json_error(array(
                        'error' => 'Error: no stock at ' . $term->name . ' for ' . $item['data']->get_name()
                    ));
                    return;
                }
            }

            //remove all items and resinsert them with the new location
            foreach (WC()->cart->get_cart() as $item) {
                $selectLocation = -1;
                foreach ($this->getWarehouseLocations() as $key => $value) {
                    if ($value->slug == $term->slug) {
                        $selectLocation = $key;
                        break;
                    }
                }

                WC()->cart->remove_cart_item($item['key']);

                $_POST['select_location'] = $selectLocation;
                WC()->cart->add_to_cart(
                    $item['product_id'],
                    $item['quantity'],
                    $item['variation_id'],
                    $item['variation']
                );
            }

            WC()->cart->calculate_totals();

            wp_send_json_success();
        }
    }
}

WoocommerceMLIMCosts::getInstance();
