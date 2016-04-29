/*******************************************************************************
 * Copyright 2012-2015 CNES - CENTRE NATIONAL d'ETUDES SPATIALES
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
/*global define: false */

/**
 * Mizar widget Core
 */
define(["jquery", "underscore-min",
        "./context/PlanetContext",
        "./context/SkyContext",

        "text!../data/backgroundSurveys.json", "./layer/LayerManager",
        "./service/NameResolver", "./service/ReverseNameResolver",
        "./service/MocBase", "./Utils",
        "./gui_core/ErrorDialog",
        "./gui_core/AboutDialog",
        "./uws/UWSManager",

        // GlobWeb
        "gw/Layer/TileWireframeLayer",
        "gw/Utils/Stats", "gw/AttributionHandler", "gw/Utils/Event",
        "gw/Navigation/TouchNavigationHandler",
        "gw/Navigation/MouseNavigationHandler",
        "gw/Navigation/KeyboardNavigationHandler",
        "gw/Renderer/ConvexPolygonRenderer",
        "gw/Renderer/PointSpriteRenderer",
        "gw/Renderer/LineStringRenderable",
        "gw/Renderer/PointRenderer",

        // Providers
        "./provider/StarProvider", "./provider/ConstellationProvider",
        "./provider/JsonProvider", "./provider/OpenSearchProvider",
        "./provider/PlanetProvider",

        "./name_resolver/NameResolverManager",
        "./reverse_name_resolver/ReverseNameResolverManager"],
    function ($, _, PlanetContext, SkyContext,
              backgroundSurveys, LayerManager, NameResolver,
              ReverseNameResolver, MocBase, Utils,
              ErrorDialog, AboutDialog, UWSManager, TileWireframeLayer, Stats,
              AttributionHandler, Event, TouchNavigationHandler,
              MouseNavigationHandler, KeyboardNavigationHandler) {

        /**
         * Private variables
         */
        var parentElement;
        var options;
        var planetContext;
        var skyContext;

        /************************************************************************************************************* */

        /**
         * Apply shared parameters to options if exist
         */
        var _applySharedParameters = function () {
            var documentURI = window.document.documentURI;
            // Retrieve shared parameters
            var sharedParametersIndex = documentURI
                .indexOf("sharedParameters=");
            if (sharedParametersIndex !== -1) {
                var startIndex = sharedParametersIndex
                    + "sharedParameters=".length;
                var sharedString = documentURI.substr(startIndex);
                if (options.shortener) {
                    $.ajax({
                        type: "GET",
                        url: options.shortener.baseUrl + '/'
                        + sharedString,
                        async: false, // TODO: create callback
                        success: function (sharedConf) {
                            _mergeWithOptions(sharedConf);
                        },
                        error: function (thrownError) {
                            console.error(thrownError);
                        }
                    });
                } else {
                    console
                        .log("Shortener plugin isn't defined, try to extract as a string");
                    var sharedParameters = JSON
                        .parse(decodeURI(sharedString));
                    _mergeWithOptions(sharedParameters);
                }
            }
        };

        /************************************************************************************************************* */

        /**
         * Remove "C"-like comment lines from string
         */
        var _removeComments = function (string) {
            var starCommentRe = new RegExp("/\\\*(.|[\r\n])*?\\\*/", "g");
            var slashCommentRe = new RegExp("[^:]//.*[\r\n]", "g");
            string = string.replace(slashCommentRe, "");
            string = string.replace(starCommentRe, "");

            return string;
        };

        /************************************************************************************************************* */

        /**
         * Merge retrieved shared parameters with Mizar configuration
         */
        var _mergeWithOptions = function (sharedParameters) {
            // Navigation
            options.navigation.initTarget = sharedParameters.initTarget;
            options.navigation.initFov = sharedParameters.fov;
            options.navigation.up = sharedParameters.up;

            // Layer visibility
            options.layerVisibility = sharedParameters.visibility;
        };

        /************************************************************************************************************* */

        /**
         * Store the mizar base url Used to access to images(Compass,
         * Mollweide, Target icon for name resolver) Also used to define
         * "star" icon for point data on-fly NB: Not the best solution of my
         * life.... TODO: think how to improve it..
         */
        // Search throught all the loaded scripts for minified version
        var scripts = document.getElementsByTagName('script');
        var mizarSrc = _.find(scripts, function (script) {
            return script.src.indexOf("MizarWidget.min") !== -1;
        });

        // Depending on its presence decide if Mizar is used on prod or on
        // dev
        var mizarBaseUrl;
        if (mizarSrc) {
            // Prod
            // Extract mizar's url
            mizarBaseUrl = mizarSrc.src.split('/').slice(0, -1).join('/')
                + '/';
        } else {
            // Dev
            // Basically use the relative path from index page
            mizarSrc = _.find(scripts, function (script) {
                return script.src.indexOf("MizarWidget") !== -1;
            });
            mizarBaseUrl = mizarSrc.src.split('/').slice(0, -1).join('/')
                + '/../';
        }

        /**
         * Mizar widget constructor
         */
        var MizarWidgetCore = function (div, globalOptions, userOptions) {
            Event.prototype.constructor.call(this);

            // Sky mode by default
            //this.mode = "sky";
            this.mode = (!_.isEmpty(userOptions.mode)) ? userOptions.mode : "sky";

            var self = this;

            parentElement = div;
            options = globalOptions;

            var extendableOptions = ["navigation", "nameResolver",
                "stats", "positionTracker", "elevationTracker"];
            // Merge default options with user ones
            for (var i = 0; i < extendableOptions.length; i++) {
                var option = extendableOptions[i];
                $.extend(options[option], userOptions[option]);
            }

            _applySharedParameters();

            // Get background surveys only
            // Currently in background surveys there are not only background
            // layers but also catalog ones
            // TODO : Refactor it !
            var layers = [];
            if (userOptions.backgroundSurveys) {
                // Use user defined background surveys
                layers = userOptions.backgroundSurveys;
            } else {
                // // Use built-in background surveys
                // backgroundSurveys = _removeComments(backgroundSurveys);
                // try
                // {
                // layers = $.parseJSON(backgroundSurveys);
                // }
                // catch (e) {
                // ErrorDialog.open("Background surveys parsing error<br/>
                // For more details see http://jsonlint.com/.");
                // console.error(e.message);
                // return false;
                // }
                $.ajax({
                    type: "GET",
                    async: false, // Deal with it..
                    url: mizarBaseUrl
                    + "data/backgroundSurveys.json",
                    dataType: "text",
                    success: function (response) {
                        response = _removeComments(response);
                        try {
                            layers = $.parseJSON(response);
                        } catch (e) {
                            ErrorDialog.open("Background surveys parsing error<br/> For more details see http://jsonlint.com/.");
                            console.error(e.message);
                            return false;
                        }
                    },
                    error: function (thrownError) {
                        console.error(thrownError);
                    }
                });
            }

            LayerManager.init(this, options);

            if (this.mode == "sky") {
                // Initialize sky&globe contexts
                skyContext = new SkyContext(div, $.extend({
                    canvas: $(div).find('#GlobWebCanvas')[0]
                }, options));
                this.activatedContext = skyContext;

                // TODO : Extend GlobWeb base layer to be able to publish events
                // by itself
                // to avoid the following useless call
                skyContext.globe.subscribe("features:added", function (featureData) {
                    self.publish("features:added", featureData);
                });

                this.sky = skyContext.globe;
                this.navigation = skyContext.navigation;

            } else { // planet
                options.mode = "3d";
                options.canvas = $(div).find('#GlobWebCanvas')[0];
                planetContext = new PlanetContext(div, options);

                this.activatedContext = planetContext;
                this.sky = planetContext.globe;
                this.navigation = planetContext.navigation;

                planetContext.setComponentVisibility("categoryDiv", true);
                planetContext.setComponentVisibility("searchDiv", false);
                planetContext.setComponentVisibility("posTracker", this.activatedContext.components.posTracker);
                planetContext.setComponentVisibility("elevTracker", this.activatedContext.components.posTracker);
                planetContext.setComponentVisibility("compassDiv", false);
                planetContext.setComponentVisibility("measureContainer", true);
                planetContext.setComponentVisibility("switch2DContainer", false);
                planetContext.setComponentVisibility("measurePlanetContainer", true);

                var planetVM = mat4.create();
                planetContext.navigation.computeInverseViewMatrix();
                mat4.inverse(planetContext.navigation.inverseViewMatrix, planetVM);

                this.sky.renderContext.tileErrorTreshold = 3;
                this.activatedContext = planetContext;
                // Store old view matrix & fov to be able to rollback to sky context
                this.oldVM = this.sky.renderContext.viewMatrix;
                this.oldFov = this.sky.renderContext.fov;
                this.navigation.globe.isSky = true;

                //planetContext.globe.publish("baseLayersReady");
                var defaultLayer = userOptions.defaultLayer || "Viking";

                // Add smooth animation from sky context to planet context
                this.navigation.toViewMatrix(planetVM, 45, 2000, function () {
                    planetContext.show();
                    planetContext.globe.refresh();
                    var marsLayer = mizar.getLayer("Mars");
                    mizar.getMizarCore().getLayerManager().setBackgroundSurvey(defaultLayer);
                    planetContext.globe.tileManager.tiling = mizar.getLayer("DSS").tiling;
                    //planetContext.globe.baseImagery.tiling = mizar.getLayer("DSS").tiling;
                    self.publish("mizarMode:toggle", marsLayer);
                    $(".backToSky").hide();
                });
            }

            // Add surveys
            for (var i = 0; i < layers.length; i++) {
                var layer = layers[i];
                var gwLayer = self.addLayer(layer);

                // Update layer visibility according to options
                if (options.layerVisibility
                    && options.layerVisibility.hasOwnProperty(layer.name)) {
                    gwLayer.visible(options.layerVisibility[layer.name]);
                }

                self.publish("backgroundSurveysReady");
            }

            // Add stats
            if (options.stats.visible) {
                new Stats(this.sky.renderContext, {
                    element: "fps",
                    verbose: options.stats.verbose
                });
                $("#fps").show();
            }

            // TODO : Extend GlobWeb base layer to be able to publish events
            // by itself
            // to avoid the following useless call

            this.sky.coordinateSystem.type = options.coordSystem;

            // Add attribution handler
            new AttributionHandler(this.sky, {
                element: 'attributions'
            });

            // Initialize name resolver
            NameResolver.init(this, this.activatedContext, options);

            // Initialize reverse name resolver
            ReverseNameResolver.init(this, this.activatedContext);

            // Create layers from configuration file
            //LayerManager.init(this, options);

            // Create data manager
            // TODO Split PickingManager
            //PickingManager.init(this, options);

            // UWS services initialization
            UWSManager.init(options);

            // Initialization of tools useful for different modules
            Utils.init(this);

            // Initialize moc base
            MocBase.init(this, options);

            // Fullscreen mode
            document.addEventListener("keydown", function (event) {
                // Ctrl + Space
                if (event.ctrlKey === true && event.keyCode === 32) {
                    $('.canvas > canvas').siblings(":not(canvas)").each(
                        function () {
                            $(this).fadeToggle();
                        });
                }
            });
        };

        /** *********************************************************************************************************** */

        Utils.inherits(Event, MizarWidgetCore);

        /** *********************************************************************************************************** */

        /**
         * Set a predefined background survey
         */
        MizarWidgetCore.prototype.setBackgroundSurvey = function (survey) {
            LayerManager.setBackgroundSurvey(survey);
        };

        /************************************************************************************************************* */

        /**
         * Set a custom background survey
         */
        MizarWidgetCore.prototype.setCustomBackgroundSurvey = function (layerDesc) {
            layerDesc.background = true; // Ensure that background option
            // is set to true
            var layer = LayerManager.addLayerFromDescription(layerDesc);
            LayerManager.setBackgroundSurvey(layerDesc.name);
            return layer;
        };

        /************************************************************************************************************* */

        /**
         *    Add additional layer(OpenSearch, GeoJSON, HIPS, grid coordinates)
         *    @param layerDesc
         *        Layer description
         *    @param planetLayer
         *        Planet layer, if described layer must be added to planet (optional)
         *    @return
         *        The created layer
         */
        MizarWidgetCore.prototype.addLayer = function (layerDesc, planetLayer) {
            this.publish('layer:fitsSupported', layerDesc, planetLayer);
            return LayerManager.addLayerFromDescription(layerDesc, planetLayer);
        };

        /************************************************************************************************************* */

        /**
         * Remove the given layer
         *
         * @param layer
         *            Layer returned by addLayer()
         */
        MizarWidgetCore.prototype.removeLayer = function (layer) {
            LayerManager.removeLayer(layer);
        };

        /************************************************************************************************************* */

        /**
         * Point to a given location
         *
         * @param location
         *            Could be: 1) Coordinates in hms/dms : "0:42:14.33
         *            41:16:7.5" 2) Coordinates in decimal degree : "11.11
         *            41.3" 3) Astronomical object name : m31, Mars, Polaris
         */
        MizarWidgetCore.prototype.goTo = function (location, callback) {
            NameResolver.goTo(location, callback);
        };

        /************************************************************************************************************* */

        /**
         * Return current fov
         */
        MizarWidgetCore.prototype.getCurrentFov = function () {
            return this.navigation.getFov();
        };

        /************************************************************************************************************* */

        /**
         * Set zoom(in other words fov)
         */
        MizarWidgetCore.prototype.setZoom = function (fovInDegrees, callback) {
            var geoPos = this.sky.coordinateSystem
                .from3DToGeo(this.navigation.center3d);
            this.navigation.zoomTo(geoPos, fovInDegrees, 1000, callback);
        };

        /**
         * TODO used in MizarWidgetGui
         *
         * Set coordinate system
         *
         * @param newCoordSystem
         *            "EQ" or "GAL"(respectively equatorial or galactic)
         */
//			MizarWidget.prototype.setCoordinateSystem = function(newCoordSystem) {
//				this.sky.coordinateSystem.type = newCoordSystem;
//
//				if (this.mollweideViewer) {
//					this.mollweideViewer.setCoordSystem(newCoordSystem);
//				}
//
//				// Publish modified event to update compass north
//				this.navigation.publish('modified');
//			};

        /************************************************************************************************************* */

        /**
         * Get all layers
         */
        MizarWidgetCore.prototype.getLayers = function () {
            return LayerManager.getLayers();
        };

        /************************************************************************************************************* */

        /**
         * Get layer with the given name
         */
        MizarWidgetCore.prototype.getLayer = function (layerName) {
            var layers = this.getLayers();
            return _.findWhere(layers, {
                name: layerName
            });
        };

        /************************************************************************************************************* */

        /**
         *
         * Get LayerManager already initialized
         */
        MizarWidgetCore.prototype.getLayerManager = function () {
            return LayerManager;
        };

        /************************************************************************************************************* */

        /**
         * Convert votable to json from url
         */
        MizarWidgetCore.prototype.convertVotable2JsonFromURL = function (url, callback) {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url);
            var self = this;
            xhr.onload = function () {
                var xml = xhr.responseXML;
                if (xml) {
                    self.convertVotable2JsonFromXML(xhr.responseText,
                        callback);
                } else {
                    console.log("No XML response");
                }
            };
            xhr.onerror = function (err) {
                console.log("Error getting table " + url + "\n" + "(" + err
                    + ")");
            };
            xhr.send(null);
        };

        /** *********************************************************************************************************** */

        /**
         * Convert votable to json from xml
         */
        MizarWidgetCore.prototype.convertVotable2JsonFromXML = function (xml, callback) {
            try {
                // Send response of xml to SiTools2 to convert it to GeoJSON
                $.ajax({
                    type: "POST",
                    url: options.votable2geojson.baseUrl,
                    data: {
                        votable: xml,
                        coordSystem: "EQUATORIAL"
                    },
                    success: function (response) {
                        callback(response);
                    },
                    error: function (thrownError) {
                        console.error(thrownError);
                    }
                });
            } catch (e) {
                console.log("Error displaying table:\n" + e.toString());
            }
        };

        /** *********************************************************************************************************** */

        /**
         * Request moc layer for the given layer TODO: Refactor MocBase !
         */
        MizarWidgetCore.prototype.requestMoc = function (layer, callback) {
            var mocLayer = MocBase.findMocSublayer(layer);
            layer.globe = this.sky;

            // Create if doesn't exist
            if (!mocLayer) {
                MocBase.createMocSublayer(layer, function (layer) {
                    callback(MocBase.findMocSublayer(layer));
                }, function (layer) {
                    callback(MocBase.findMocSublayer(layer));
                });
            } else {
                callback(mocLayer);
            }
        };

        /** *********************************************************************************************************** */

        /**
         * Request sky coverage based on moc TODO: Refactor MocBase !
         */
        MizarWidgetCore.prototype.requestSkyCoverage = function (layer, callback) {
            MocBase.getSkyCoverage(layer, function (layer) {
                callback(layer.coverage);
            }, function (layer) {
                callback(layer.coverage);
            });
        };

        /** *********************************************************************************************************** */

        /**
         * Intersect the given layers
         */
        MizarWidgetCore.prototype.xMatch = function (layers) {
            return MocBase.intersectLayers(layers);
        };

        /** *********************************************************************************************************** */

        /**
         * View planet with the given name
         */
        MizarWidgetCore.prototype.viewPlanet = function (planetName, planetDimension) {
            var planetLayer = this.getLayer(planetName);
            if (planetLayer) {
                // HACK : mizar must be in sky mode to be toggled to earth
                // mode
                // TODO: think about better mode management..
                this.mode = "sky";
                this.toggleMode(planetLayer, planetDimension);
            } else {
                console.error("No planet with name : " + planetName
                    + " has been found");
            }

        };

        /** *********************************************************************************************************** */

        /**
         * Toggle between planet/sky mode
         */
        MizarWidgetCore.prototype.toggleMode = function (gwLayer, planetDimension, callback) {
            //this.publish("mizarMode:toggleActivated", gwLayer, planetDimension, callback);
            mizar.getMizarGui().toggleMode(gwLayer, planetDimension, callback);
        };

        /** *********************************************************************************************************** */

        /**
         * Toggle between planet/sky mode
         */
        MizarWidgetCore.prototype.toggleDimension = function (gwLayer) {
            if (this.mode === "sky") {
                return;
            }

            var dimension = this.activatedContext.toggleDimension();
            var callback = function () {
                this.viewPlanet("Mars", dimension);
            }.bind(this);

            this.toggleMode(undefined, undefined, callback);

            // // Hide planet
            // planetContext.hide();
            // // Destroy planet context
            // planetContext.destroy();
            // planetContext = null;

            // this.viewPlanet("Mars", dimension);
        };

        return MizarWidgetCore;

    });
