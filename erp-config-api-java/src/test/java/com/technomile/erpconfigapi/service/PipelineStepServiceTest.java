package com.technomile.erpconfigapi.service;

import com.technomile.erpconfigapi.common.AppException;
import com.technomile.erpconfigapi.dto.PipelineStepDtos.PipelineStepCreateDto;
import com.technomile.erpconfigapi.dto.PipelineStepDtos.PipelineStepUpdateDto;
import com.technomile.erpconfigapi.entity.Pipeline;
import com.technomile.erpconfigapi.entity.PipelineStep;
import com.technomile.erpconfigapi.entity.Step;
import com.technomile.erpconfigapi.repository.PipelineStepRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PipelineStepServiceTest {

    @Mock
    private PipelineStepRepository pipelineStepRepository;
    @Mock
    private PipelineService pipelineService;
    @Mock
    private StepService stepService;

    @InjectMocks
    private PipelineStepService pipelineStepService;

    @Test
    void createShouldFailWhenClientMismatch() {
        Pipeline p = new Pipeline();
        p.setPipelineId("p1");
        p.setClientId("c1");
        Step s = new Step();
        s.setStepPk(2L);
        s.setClientId("c2");
        when(pipelineService.findEntity("p1")).thenReturn(p);
        when(stepService.findEntity(2L)).thenReturn(s);

        AppException ex = assertThrows(AppException.class,
                () -> pipelineStepService.create(new PipelineStepCreateDto("p1", 2L, 1)));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatus());
    }

    @Test
    void createShouldFailForDuplicateStep() {
        Pipeline p = new Pipeline();
        p.setPipelineId("p1");
        p.setClientId("c1");
        Step s = new Step();
        s.setStepPk(2L);
        s.setClientId("c1");
        when(pipelineService.findEntity("p1")).thenReturn(p);
        when(stepService.findEntity(2L)).thenReturn(s);
        when(pipelineStepRepository.findByPipelineIdAndStepPk("p1", 2L)).thenReturn(Optional.of(new PipelineStep()));

        AppException ex = assertThrows(AppException.class,
                () -> pipelineStepService.create(new PipelineStepCreateDto("p1", 2L, 1)));

        assertEquals(HttpStatus.CONFLICT, ex.getStatus());
    }

    @Test
    void updateShouldFailOnSeqConflict() {
        PipelineStep existing = new PipelineStep();
        existing.setPipelineStepPk(10L);
        existing.setPipelineId("p1");
        existing.setSeq(1);
        when(pipelineStepRepository.findById(10L)).thenReturn(Optional.of(existing));

        PipelineStep taken = new PipelineStep();
        taken.setPipelineStepPk(11L);
        when(pipelineStepRepository.findByPipelineIdAndSeq("p1", 2)).thenReturn(Optional.of(taken));

        AppException ex = assertThrows(AppException.class,
                () -> pipelineStepService.update(10L, new PipelineStepUpdateDto(2)));

        assertEquals(HttpStatus.CONFLICT, ex.getStatus());
    }

    @Test
    void createShouldSucceed() {
        Pipeline p = new Pipeline();
        p.setPipelineId("p1");
        p.setClientId("c1");
        Step s = new Step();
        s.setStepPk(2L);
        s.setClientId("c1");
        when(pipelineService.findEntity("p1")).thenReturn(p);
        when(stepService.findEntity(2L)).thenReturn(s);
        when(pipelineStepRepository.findByPipelineIdAndStepPk("p1", 2L)).thenReturn(Optional.empty());
        when(pipelineStepRepository.findByPipelineIdAndSeq("p1", 1)).thenReturn(Optional.empty());
        when(pipelineStepRepository.save(any(PipelineStep.class))).thenAnswer(i -> {
            PipelineStep ps = i.getArgument(0);
            ps.setPipelineStepPk(1L);
            return ps;
        });

        var out = pipelineStepService.create(new PipelineStepCreateDto("p1", 2L, 1));

        assertEquals(1L, out.pipeline_step_pk());
        assertEquals("p1", out.pipeline_id());
    }

    @Test
    void listForPipelineShouldReturnSortedList() {
        Pipeline p = new Pipeline();
        p.setPipelineId("p1");
        when(pipelineService.findEntity("p1")).thenReturn(p);

        PipelineStep row = new PipelineStep();
        row.setPipelineStepPk(9L);
        row.setPipelineId("p1");
        row.setStepPk(2L);
        row.setSeq(1);
        when(pipelineStepRepository.findByPipelineIdOrderBySeqAsc("p1")).thenReturn(List.of(row));

        var out = pipelineStepService.listForPipeline("p1");

        assertEquals(1, out.size());
    }

    @Test
    void getShouldThrowWhenMissing() {
        when(pipelineStepRepository.findById(99L)).thenReturn(Optional.empty());

        AppException ex = assertThrows(AppException.class, () -> pipelineStepService.get(99L));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
    }

    @Test
    void updateShouldSucceedWhenSeqAvailable() {
        PipelineStep existing = new PipelineStep();
        existing.setPipelineStepPk(10L);
        existing.setPipelineId("p1");
        existing.setSeq(1);
        when(pipelineStepRepository.findById(10L)).thenReturn(Optional.of(existing));
        when(pipelineStepRepository.findByPipelineIdAndSeq("p1", 2)).thenReturn(Optional.empty());
        when(pipelineStepRepository.save(any(PipelineStep.class))).thenAnswer(i -> i.getArgument(0));

        var out = pipelineStepService.update(10L, new PipelineStepUpdateDto(2));

        assertEquals(2, out.seq());
    }

    @Test
    void deleteShouldRemoveEntry() {
        PipelineStep existing = new PipelineStep();
        existing.setPipelineStepPk(10L);
        when(pipelineStepRepository.findById(10L)).thenReturn(Optional.of(existing));

        pipelineStepService.delete(10L);

        verify(pipelineStepRepository).delete(existing);
    }
}
