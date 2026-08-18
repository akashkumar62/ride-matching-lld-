package com.ridematching.user.controller;

import com.ridematching.common.response.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

// Stub until rideService exists — replace with a real call once it's built.
@RestController
@RequestMapping("/users/rides")
public class RideHistoryController {

    @GetMapping
    public ApiResponse<List<Object>> history() {

        return ApiResponse.success(List.of());
    }

}