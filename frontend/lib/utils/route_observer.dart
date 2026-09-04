import 'package:flutter/widgets.dart';

/// Shared [RouteObserver] registered on the app's [MaterialApp] so screens
/// inside the app can learn when a new screen is pushed on top of them
/// (e.g. the Clips feed pauses its audio when a profile or comments screen
/// covers it).
final RouteObserver<PageRoute<dynamic>> routeObserver =
    RouteObserver<PageRoute<dynamic>>();
