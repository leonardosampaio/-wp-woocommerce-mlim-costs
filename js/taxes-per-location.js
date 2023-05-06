const saveTaxesButton = document.querySelector('button[name=save]');
const taxesTable = document.querySelector('.wc_input_table');

const locationOptions = () => {
    const select = document.createElement('select');
    select.classList.add('tax-rate-location-select');
    select.appendChild(new Option('Any warehouse', ''));

    if (taxes_per_location_backend.locations) {
        for (const location of taxes_per_location_backend.locations) {
            if (!location.term_id || !location.name) {
                return;
            }
            select.appendChild(new Option(location.name, location.term_id));
        }
    }

    return select;
}

const setSavedLocationsOnSelects = () => {
    if (!taxesTable) {
        return;
    }
    taxesTable.querySelectorAll('tr').forEach((tr) => {
        const select = tr.querySelector('.tax-rate-location-select');
        if (!select) {
            return;
        }
        const savedLocation = getTaxLocation(tr.dataset.id);
        if (savedLocation) {
            select.value = savedLocation.location_id;
        }
    });
}

const addSelects = () => {
    if (!taxesTable) {
        return;
    }

    const locationsSelect = locationOptions();

    //add new column
    if (!document.querySelector('.tax-rate-location-th')) {
        const th = document.createElement('th');
        th.innerHTML = 'Location';
        th.style['text-align'] = 'center';
        th.classList.add('tax-rate-location-th');
        taxesTable.querySelector('thead tr').appendChild(th);
    }

    //footer colspan with 1 more column
    taxesTable.querySelector('tfoot th').attributes['colspan'].value = 10;

    //watch tr changes and add new location td
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (!mutation.addedNodes.length) {
                return;
            }

            mutation.addedNodes.forEach((tr) => {
                if (tr.nodeName !== 'TR') {
                    return
                }

                if (!tr.querySelector('.tax-rate-location-td') &&
                    -1 === tr.dataset.id.indexOf('new'))
                {
                    const spanTd = tr.querySelector('.tax-rate-span-td')
                    if (spanTd) {
                        spanTd.remove();
                    }

                    const td = document.createElement('td');
                    td.classList.add('tax-rate-location-td');
                    td.appendChild(locationsSelect.cloneNode(true));
                    td.style['text-align'] = 'center';
                    td.style['vertical-align'] = 'middle';
                    tr.appendChild(td);
                }
                else {
                    const td = document.createElement('td');
                    td.classList.add('tax-rate-span-td');
                    td.style['text-align'] = 'center';
                    td.style['vertical-align'] = 'middle';
                    const span = document.createElement('span');
                    span.innerText = 'Save changes first to select a location';
                    td.appendChild(span);
                    tr.appendChild(td);
                }
            });
        });
        setSavedLocationsOnSelects();
    });
    observer.observe(
        taxesTable.querySelector('tbody'),
        {
            attributes: true,
            childList: true,
            characterData: true,
            subtree: true
        }
    );
}

const getTaxLocation = (id) => {
    let taxes = null;
    try {
        taxes = JSON.parse(localStorage.getItem('WoocommerceMLIMCosts_taxesLocations'));
        if (!taxes) {
            return;
        }
    }
    catch (e) {
        return;
    }

    return taxes.find((tax) => tax.tax_id == id);
}

const getTaxRates = () => {
    fetch(taxes_per_location_backend.ajax_url, {
        method: 'POST',
        body: new URLSearchParams({
            action: 'get_taxes_locations',
            security: taxes_per_location_backend.nonce
        })
    }).then(response => response.json())
    .then(data => {
        if (data.success) {

            const taxes = data.data;
            
            console.debug('got', taxes);

            if (!taxes.length) {
                return;
            }

            localStorage.setItem('WoocommerceMLIMCosts_taxesLocations', JSON.stringify(taxes));

            setSavedLocationsOnSelects();
        }
    });
}

const getLocationsFromLocalStorage = () => {
    if (!taxesTable) {
        return;
    }
    try {
        return JSON.parse(localStorage.getItem('WoocommerceMLIMCosts_taxesLocations'));
    }
    catch (e) {
        return;
    }
}

const setLocationsOnLocalStorage = () => {
    if (!taxesTable) {
        return;
    }
    localStorage.setItem(
        'WoocommerceMLIMCosts_taxesLocations',
        JSON.stringify(getTaxLocationMap())
    );
    console.debug('saveLocationsOnSelects',getTaxLocationMap())
}

const getTaxLocationMap = () => {
    let taxes = [];
            document.querySelectorAll('tbody tr[data-id]').forEach((tr) => {
                const id = tr.dataset.id;
                const location = tr.querySelector('td .tax-rate-location-select').value;
                taxes.push({ tax_id:id, location_id:location });
            });
    return taxes;
}

const saveTaxRates = () => {
    if (!taxesTable) {
        return;
    }

    setLocationsOnLocalStorage();

    const maxTime = 10_000;
    let totalTime = 0;
    const intervalId = setInterval(() => {
        totalTime += 100;
        if (!document.querySelectorAll('tbody tr[data-id^=new]').length) {
            clearTimeout(intervalId);

            setSavedLocationsOnSelects();

            const taxes = getLocationsFromLocalStorage();

            console.debug('saving', taxes);

            fetch(taxes_per_location_backend.ajax_url, {
                method: 'POST',
                body: new URLSearchParams({
                    action: 'save_taxes_locations',
                    security: taxes_per_location_backend.nonce,
                    taxesLocations: JSON.stringify(taxes)
                })
            }).then(response => response.json())
            .then(data => {

                console.debug('saved', data);

                if (data.success) {
                    return;
                }

                console.error('Error:', data);
            })
            .catch((error) => {
                console.error('Error:', error);
            });

            return;
        }

        if (maxTime < totalTime) {
            console.log('timeout', new Date());
            clearTimeout(intervalId);
        }
    }, 100);
}

document.addEventListener("DOMContentLoaded", () => {
    getTaxRates();
    addSelects();
    saveTaxesButton.addEventListener('click', saveTaxRates);
});