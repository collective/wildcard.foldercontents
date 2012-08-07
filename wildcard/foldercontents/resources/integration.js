var id_prefix = 'folder-contents-item-';
var container_id = 'folderlisting-main-table-noplonedrag';
var load_more_locked = false;
var last_folder_url = window.location.href;

fc = {
    showLoading: function(){
        $('#kss-spinner').show();
    },
    hideLoading: function(){
        $('#kss-spinner').hide();
    },
    moveItem: function(row, params, callback){
        fc.showLoading();
        params.itemid = row.attr('id').substring(id_prefix.length);
        if(params.action === undefined){
            params.action = 'movedelta'
        }
        params['_authenticator'] = $('input[name="_authenticator"]').attr('value');
        $.ajax({
            type: 'POST',
            url: $('base').attr('href') + '@@fcmove',
            data: params,
            success: function(){
                if(callback !== undefined){
                    callback();
                }
                fc.hideLoading();
            },
            failure: function(){
                console.log('fail');
                fc.hideLoading();
            }
        });
    },
    reloadPage: function(){
        fc.showLoading();
        $.ajax({
            url: last_folder_url,
            success: function(data){
                $('#listing-table').replaceWith($(data).find('#listing-table'));
                fc.initialize();
                fc.hideLoading();
            }
        });
    },
    initialize: function(){
        var start = null;
        $('#listing-table tbody').sortable({
            start: function(event, ui){
                start = ui.item.index();
            },
            update: function(event, ui) {
                fc.moveItem(ui.item, {delta: ui.item.index() - start});
            },
            change: function(event, ui){
                if(load_more_locked){
                    return;
                }
                var rows = $('#listing-table tbody tr');
                if((ui.placeholder.index() + 3) > rows.length){
                    var next = $('.listingBar .next a');
                    if(next.length > 0){
                        load_more_locked = true;
                        $.ajax({
                            url: next.attr('href'),
                            success: function(data){
                                var html = $(data);
                                $('.listingBar').replaceWith(html.find('.listingBar').eq(0));
                                $('#listing-table tbody').append(
                                    html.find('#listing-table tbody tr'));
                                $('#listing-table tbody').sortable('refresh');
                                load_more_locked = false;
                            }
                        })
                    }
                }
            }
        });
        $('.dropdown-toggle').dropdown();
        $('#content-core').delegate('.move-top', 'click', function(){
            fc.showLoading();
            var el = $(this).parents('tr');
            fc.moveItem(el, {action: 'movetop'}, fc.reloadPage);
            return false;
        });
        $('#content-core').delegate('.move-bottom', 'click', function(){
            fc.showLoading();
            var el = $(this).parents('tr');
            fc.moveItem(el, {action: 'movebottom'}, fc.reloadPage);
            return false;
        });

        // ajaxify some links
        $('#content-core').delegate('#foldercontents-selectall,#foldercontents-show-batched,.listingBar a,#foldercontents-clearselection,#foldercontents-show-all',
                'click', function(){
            fc.showLoading();
            last_folder_url = $(this).attr('href');
            $.ajax({
                url: last_folder_url,
                success: function(data){
                    $('#' + container_id).replaceWith(
                        $(data).find('#' + container_id));
                    fc.hideLoading();
                    fc.initialize();
                }
            })
            return false;
        });

        $('#upload-files').click(function(){
            addUploader();
            return false;
        });
        $('#sort-folder').click(function(){
            $('#sort-container').show();
            return false;
        });
    }
};

(function($){
$(document).ready(function(){
    fc.initialize();
});
})(jQuery);