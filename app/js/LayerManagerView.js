/******************************************************************************* 
* Copyright 2012, 2013 CNES - CENTRE NATIONAL d'ETUDES SPATIALES 
* 
* This file is part of SITools2. 
* 
* SITools2 is free software: you can redistribute it and/or modify 
* it under the terms of the GNU General Public License as published by 
* the Free Software Foundation, either version 3 of the License, or 
* (at your option) any later version. 
* 
* SITools2 is distributed in the hope that it will be useful, 
* but WITHOUT ANY WARRANTY; without even the implied warranty of 
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the 
* GNU General Public License for more details. 
* 
* You should have received a copy of the GNU General Public License 
* along with SITools2. If not, see <http://www.gnu.org/licenses/>. 
******************************************************************************/ 

/**
 * Layer manager view module
 */
define( [ "jquery", "underscore-min", "./LayerManager", "./ErrorDialog", "./LayerServiceView", "./BackgroundLayersView", "./AdditionalLayersView", "./FitsLoader", "./ImageManager", "jquery.ui"], 
	function($, _, LayerManager, ErrorDialog, LayerServiceView, BackgroundLayersView, AdditionalLayersView, FitsLoader, ImageManager) {

/**
 * Private variables
 */
var mizar;
var configuration;

// GeoJSON data providers
var dataProviders = {};
var votable2geojsonBaseUrl;
var parentElement;
var $el;


/**
 * Private functions
 */

/**************************************************************************************************************/

/**
 * 	Drop event
 */
function handleDrop(evt) {
	evt.stopPropagation();
	evt.preventDefault();

	var files = evt.dataTransfer.files; // FileList object.
	// Files is a FileList of File objects.
	$.each( files, function(index, f) {
		
		var name = f.name;
		var reader = new FileReader();
		$('#loading').show();

		if ( f.type == "image/fits" )
		{
			// Handle fits image
			reader.onloadend = function(e) {
				var arrayBuffer = this.result;
				var fits = FitsLoader.parseFits(arrayBuffer);

				var gwLayer = LayerManager.createLayerFromFits(name, fits);
				AdditionalLayersView.addView( gwLayer );

				// Add fits texture
				var featureData = {
					layer: gwLayer,
					feature: gwLayer.features[0],
					isFits: true
				};
				var fitsData = fits.getHDU().data;
				mizar.publish("image:add", featureData);
				ImageManager.handleFits( fitsData, featureData );

				$('#loading').hide();
			};
			reader.readAsArrayBuffer(f);
		}
		else
		{
			reader.onloadend = function(e) {

				if ( this.result.search('<?xml') > 0 )
				{
					$.ajax({
						type: "GET",
						url: votable2geojsonBaseUrl,
						data: {
							url: proxyUrl,
							coordSystem: "EQUATORIAL"
						},
						success: function(response)
						{

							var gwLayer = LayerManager.createLayerFromGeoJson(name, response);
							AdditionalLayersView.addView( gwLayer );
							$('#loading').hide();
						},
						error: function(thrownError)
						{
							console.error(thrownError);
						}
					});
				}
				else
				{
					// Handle as json if possible
					try {
						var response = $.parseJSON(this.result);
					} catch (e) {
						ErrorDialog.open("JSON parsing error : " + e.type + "<br/> For more details see http://jsonlint.com/.");
						$('#loading').hide();
						return false;
					}

					var gwLayer = LayerManager.createLayerFromGeoJson(name, response);
					AdditionalLayersView.addView( gwLayer );
					$('#loading').hide();
				}
				
			};
			reader.readAsText(f);
		}

	});
}

/**************************************************************************************************************/

/**
 * 	Drag over event
 */
function handleDragOver(evt)
{
	evt.stopPropagation();
	evt.preventDefault();
	evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
}

/**************************************************************************************************************/

/**
 *	Initialize view with layers stored in <LayerManager>
 */
function initLayers() 
{
	var layers = LayerManager.getLayers();

	// Add view depending on category of each layer
	for ( var i=0; i<layers.length; i++ )
	{
		var layer = layers[i];
		if ( layer.category == "background" )
		{
			BackgroundLayersView.addView( layer );
		}
		else
		{
			AdditionalLayersView.addView( layer );
		}
	}
}

/**************************************************************************************************************/

/**
 *	Init background layer only from the given planet layer
 */
function initPlanetLayer(planetLayer)
{
	// Add planet WMS layers only
	for ( var i=0; i<planetLayer.layers.length; i++ )
	{
		var layer = planetLayer.layers[i];
		BackgroundLayersView.addView( layer );
	}	
}

/**************************************************************************************************************/

return {

	/**
	 *	Init
	 *
	 *	@param mizar
	 *		Mizar API object
	 *	@param configuration
	 *		Mizar configuration 
 	 */
	init: function(m, conf) {
		mizar = m;
		configuration = conf;
		parentElement = configuration.element;
		$el = $('<div id="accordion" style="display: none;"></div>').appendTo(parentElement);
		configuration.element = $el;

		BackgroundLayersView.init({ mizar: mizar, configuration: configuration });
		AdditionalLayersView.init({ mizar: mizar, configuration: configuration });

		mizar.subscribe("backgroundLayer:add", BackgroundLayersView.addView);
		mizar.subscribe("additionalLayer:add", AdditionalLayersView.addView);
		mizar.subscribe("mizarMode:toggle", this.toggleMode);

		// Necessary to drag&drop option while using jQuery
		$.event.props.push('dataTransfer');

		// Due to scroll initialization which corrumps accordion UI init in additional layers view,
		// accordion UI must be initialized before
		$el.accordion( {
			header: "> div > h3",
			autoHeight: false,
			active: 0,
			collapsible: true,
			heightStyle: "content"
		} ).show().accordion("refresh");

		initLayers();
		LayerServiceView.init(mizar, configuration);

		// Setup the drag & drop listeners.
		$('canvas').on('dragover', handleDragOver);
		$('canvas').on('drop', handleDrop);

		if ( configuration.votable2geojson )
		{
			votable2geojsonBaseUrl = configuration.votable2geojson.baseUrl;
		}
	},

	/**
	 *	Unregister all event handlers and remove view
	 */
	remove: function() {
		AdditionalLayersView.remove();
		BackgroundLayersView.remove();
		LayerServiceView.remove();
		$(parentElement).empty();

		mizar.unsubscribe("backgroundLayer:add", BackgroundLayersView.addView);
		mizar.unsubscribe("additionalLayer:add", AdditionalLayersView.addView);
		$('canvas').off('dragover', handleDragOver);
		$('canvas').off('drop', handleDrop);
	},

	/**
	 *	Update view depending on mizar mode
	 *
	 *	@param planetLayer
	 *		Planet layer if toggled in globe mode
	 */
	toggleMode: function(planetLayer) {
		if ( mizar.mode == "sky" ) {
			// Reinit background&additional views
			BackgroundLayersView.remove();
			BackgroundLayersView.init( { mizar: mizar, configuration: configuration } );
			AdditionalLayersView.init({ mizar: mizar, configuration: configuration });
			initLayers();
		}
		else
		{
			// Reinit only background layers view for the given planet layer
			BackgroundLayersView.remove();
			AdditionalLayersView.remove();
			BackgroundLayersView.init( { mizar: mizar, configuration: configuration } );
			initPlanetLayer(planetLayer);
		}
		$el.accordion("option", "active", 0 ).accordion("refresh");
	},

	/**
	 *	Returns the state of view
	 */
	isInitialized: function()
	{
		return (mizar.sky != null)
	}
};

});