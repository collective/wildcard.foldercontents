/*jslint browser: true */
/*jslint unparam: true */
/*jslint nomen: true */
/*global $, jQuery */

var id_prefix = 'folder-contents-item-';
var container_id = 'folderlisting-main-table-noplonedrag';
var load_more_locked = false;
var last_folder_url = window.location.href;
var shifted = false;
var last_checked = null;
var fc;

fc = {
    sortable: function() {
        var sort_on = $('#foldercontents-order-column').data('sort_on');
        return sort_on === undefined || sort_on === '' || sort_on === 'getObjPositionInParent';
    },
    showLoading: function() {
        $('#kss-spinner').show();
    },
    hideLoading: function() {
        $('#kss-spinner').hide();
    },
    moveItem: function(row, params, callback) {
        fc.showLoading();
        params.itemid = row.attr('id').substring(id_prefix.length);
        if (params.action === undefined) {
            params.action = 'movedelta';
        }
        params['_authenticator'] = $('input[name="_authenticator"]').attr('value');
        $.ajax({
            type: 'POST',
            url: $('div.fc-container').data('contextBaseUrl') + '@@fcmove',
            data: params,
            success: function() {
                if (callback !== undefined) {
                    callback();
                }
                fc.hideLoading();
            },
            failure: function() {
                console.log('fail');
                fc.hideLoading();
            }
        });
    },
    reloadPage: function() {
        fc.showLoading();
        $.ajax({
            url: last_folder_url,
            success: function(data) {
                $('#listing-table').replaceWith($(data).find('#listing-table'));
                fc.initialize();
                fc.hideLoading();
            }
        });
    },
    initialize: function() {
        var start = null;
        if (fc.sortable()) {
            $('#listing-table tbody').sortable({
                forcePlaceholderSize: true,
                placeholder: "sortable-placeholder",
                forceHelperSize: true,
                helper: "clone",
                start: function(event, ui) {
                    var origtds, helpertds;
                    // show original, get width, then hide again
                    ui.item.css('display', '');
                    origtds = ui.item.find('td');
                    helpertds = ui.helper.find('td');
                    origtds.each(function(index) {
                        helpertds.eq(index).css('width', $(this).width());
                    });
                    ui.item.css('display', 'none');
                    start = ui.item.index();
                },
                update: function(event, ui) {
                    fc.moveItem(ui.item, {
                        delta: ui.item.index() - start
                    });
                },
                change: function(event, ui) {
                    var rows, next;
                    if (load_more_locked) {
                        return;
                    }
                    rows = $('#listing-table tbody tr');
                    if ((ui.placeholder.index() + 3) > rows.length) {
                        next = $('.listingBar .next a');
                        if (next.length > 0) {
                            load_more_locked = true;
                            $.ajax({
                                url: next.attr('href'),
                                success: function(data) {
                                    var html = $(data);
                                    $('.listingBar').replaceWith(html.find('.listingBar').eq(0));
                                    $('#listing-table tbody').append(
                                        html.find('#listing-table tbody tr'));
                                    if (fc.sortable()) {
                                        $('#listing-table tbody').sortable('refresh');
                                    }
                                    load_more_locked = false;
                                }
                            });
                        }
                    }
                }
            });
        }
        $('.dropdown-toggle').dropdown();
        $('#content-core').delegate('.move-top', 'click', function() {
            fc.showLoading();
            var el = $(this).parents('tr');
            fc.moveItem(el, {
                action: 'movetop'
            }, fc.reloadPage);
            return false;
        });
        $('#content-core').delegate('.move-bottom', 'click', function() {
            fc.showLoading();
            var el = $(this).parents('tr');
            fc.moveItem(el, {
                action: 'movebottom'
            }, fc.reloadPage);
            return false;
        });

        // ajaxify some links
        $('#content-core').delegate('#foldercontents-selectall,#foldercontents-show-batched,.listingBar a,#foldercontents-clearselection,#foldercontents-show-all',
            'click', function() {
                fc.showLoading();
                last_folder_url = $(this).attr('href');
                $.ajax({
                    url: last_folder_url,
                    success: function(data) {
                        $('#' + container_id).replaceWith(
                            $(data).find('#' + container_id));
                        fc.hideLoading();
                        fc.initialize();
                    }
                });
                return false;
            });

        $('#upload-files').click(function() {
            $('#fileupload').fadeIn();
            return false;
        });
        $('#sort-folder').click(function() {
            $('#sort-container').fadeIn();
            return false;
        });

        $('#content-core').delegate('#listing-table input[type="checkbox"]', 'change', function(event) {
            if (shifted && last_checked !== null) {
                var self, last_checked_index, this_index;
                //find closest sibling
                self = $(this);
                last_checked_index = last_checked.parents('tr').index();
                this_index = self.parents('tr').index();
                $('#listing-table input[type="checkbox"]').each(function() {
                    var el, index;
                    el = $(this);
                    index = el.parents('tr').index();
                    if ((index > last_checked_index && index < this_index) ||
                        (index < last_checked_index && index > this_index)) {
                        this.checked = self[0].checked;
                    }
                });
            } else {
                last_checked = $(this);
            }
        });

    }
};

(function($) {
    $(document).ready(function() {
        fc.initialize();
        $(document).bind('keyup keydown', function(e) {
            shifted = e.shiftKey;
        });

        $('#fileupload').fileupload({
            'limitConcurrentUploads': 2,
            'singleFileUploads': true,
            'dataType': 'json',
            'formData': {
                '_authenticator': $('input[name="_authenticator"]').attr('value')
            },
            maxChunkSize: 5000000
        }).bind('fileuploadcompleted', function(){
            fc.showLoading();
            $.ajax({
                url: window.location.href,
                success: function(data) {
                    $('#' + container_id).replaceWith(
                        $(data).find('#' + container_id));
                    fc.hideLoading();
                    fc.initialize();
                }
            }); 
        });
    });
}(jQuery));
